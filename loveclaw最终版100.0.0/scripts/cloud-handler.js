/**
 * 八字缘分匹配 - 云端版会话处理 v2.0.0
 * 简化流程：手机号即账号，匹配后才能看到对方信息
 * v2.0.0: 多channel支持 - 用户通过什么渠道报名，就通过什么渠道收到通知
 */

const cloudData = require('./cloud-data');
const bazi = require('./bazi');
const match = require('./match');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

// ==================== ADMIN WHITELIST ====================
// 只有在白名单中的 userId 才能执行管理操作
// 普通用户使用技能时会使用真实的 channel userId（如飞书的 ou_xxx）
const ADMIN_WHITELIST = [
  'ou_fe6db6db17060625cf3b5aa309d7d85d',  // 管理员飞书用户ID
];

/**
 * 检查 userId 是否为管理员
 */
function isAdmin(userId) {
  return ADMIN_WHITELIST.includes(userId);
}

// ==================== SESSION MANAGEMENT ====================
const SESSION_FILE = os.homedir() + '/.openclaw/workspace/skills/loveclaw/sessions.json';
let userSessions = new Map(); // userId -> { state, data }
let idMap = {}; // phone -> userId

// Session states
const UserState = {
  NONE: 0,
  PHONE: 1,      // waiting for phone
  NAME: 2,      // waiting for name
  GENDER: 3,    // waiting for gender
  PREFERRED_GENDER: 4,
  BIRTH_DATE: 5,
  BIRTH_HOUR: 6,
  CITY: 7,
  PHOTO: 8,
  CONFIRM: 9,
};

// ==================== CRON AUTO-SETUP ====================

/**
 * 检查并自动注册定时任务（幂等操作）
 * 每次 handler 调用时检查，不存在则注册
 */
function setupCronJobs() {
  try {
    // 检查现有 cron 任务
    let cronList = { jobs: [] };
    try {
      const output = execSync('openclaw cron list --json', { encoding: 'utf-8' });
      cronList = JSON.parse(output);
    } catch (e) {
      // 如果没有 cron list 输出，继续尝试注册
      console.log('[CronSetup] 检查现有任务失败，继续注册:', e.message);
    }

    // 检查每日匹配任务是否存在
    const hasDailyMatch = cronList.jobs.some(j => j.name === 'LoveClaw-每日匹配');
    if (!hasDailyMatch) {
      try {
        execSync(
          'openclaw cron add --name "LoveClaw-每日匹配" --cron "50 19 * * *" --tz "Asia/Shanghai" --message "cd ~/.openclaw/workspace/skills/loveclaw/scripts && node cloud-cron.js match" --session isolated',
          { stdio: 'pipe' }
        );
        console.log('[CronSetup] 每日匹配任务已注册');
      } catch (e) {
        console.log('[CronSetup] 注册每日匹配任务失败:', e.message);
      }
    }

    // 检查晚间报告任务是否存在
    const hasEveningReport = cronList.jobs.some(j => j.name === 'LoveClaw-晚间报告');
    if (!hasEveningReport) {
      try {
        execSync(
          'openclaw cron add --name "LoveClaw-晚间报告" --cron "0 20 * * *" --tz "Asia/Shanghai" --message "cd ~/.openclaw/workspace/skills/loveclaw/scripts && node cloud-cron.js report" --session isolated',
          { stdio: 'pipe' }
        );
        console.log('[CronSetup] 晚间报告任务已注册');
      } catch (e) {
        console.log('[CronSetup] 注册晚间报告任务失败:', e.message);
      }
    }
  } catch (e) {
    // 静默失败，不影响正常流程
    console.log('[CronSetup] 定时任务自动注册失败:', e.message);
  }
}

// Load sessions from file
function loadSessionsFromFile() {
  try {
    const dataStr = fs.readFileSync(SESSION_FILE, 'utf-8');
    const loaded = JSON.parse(dataStr);
    delete loaded._idMap;
    loaded._idMap = JSON.parse(dataStr)._idMap || {};
    return loaded;
  } catch {
    return { _idMap: {} };
  }
}

// Save sessions to file
function saveSessionsToFile(sessionList) {
  try {
    const allData = loadSessionsFromFile();
    for (const { userId, session } of sessionList) {
      if (userId) {
        allData[userId] = session;
      }
    }
    allData._idMap = idMap;
    fs.writeFileSync(SESSION_FILE, JSON.stringify(allData, null, 2));
  } catch (e) {
    console.error('Save error:', e.message);
  }
}

// Get or create user session - NEVER overwrites existing session data
function getUserSession(userId) {
  if (userSessions.has(userId)) {
    return userSessions.get(userId);
  }
  // New user - load from file
  const loaded = loadSessionsFromFile();
  const idMapLoad = loaded._idMap || {};
  delete loaded._idMap;
  for (const [k, v] of Object.entries(loaded)) {
    v._idMap = idMapLoad[k];
    userSessions.set(k, v);
  }
  if (idMapLoad[userId] && userSessions.has(idMapLoad[userId])) {
    return userSessions.get(idMapLoad[userId]);
  } else if (userSessions.has(userId)) {
    return userSessions.get(userId);
  }
  const newSession = { state: UserState.NONE, data: {} };
  userSessions.set(userId, newSession);
  return newSession;
}

// ==================== HANDLER ====================

/**
 * @param {string} userId - User identifier
 * @param {string} message - User message
 * @param {string} channel - User's channel (feishu/webchat/etc), defaults to webchat
 * @param {string} mediaPath - Optional local file path for media attachments
 */
async function handleMessage(userId, message, channel = 'webchat', mediaPath = '') {
  // 自动注册定时任务（幂等操作）
  setupCronJobs();
  
  // 安全检查：识别测试/自定义 userId，非管理员拒绝
  // 正常用户通过 channel 传来的 userId 通常是 channel-specific 的 ID（如飞书的 ou_xxx）
  // 测试用的 userId 通常是自定义的字符串（如 "test-user-xxx"、手机号等）
  const isSuspiciousUserId = /^(test-|human-|\d{10,}$)/.test(userId);
  if (isSuspiciousUserId && !isAdmin(userId)) {
    return { text: '【提示】此操作需要管理员权限。如需帮助，请联系管理员。' };
  }
  
  const session = getUserSession(userId);
  
  // Ensure channel is stored in session for notification routing
  if (channel && !session.data.channel) {
    session.data.channel = channel;
  }
  
  try {
    // ==================== STATE: NONE (start) ====================
    if (session.state === UserState.NONE) {
      if (['启动爱情龙虾技能','爱情龙虾','loveclaw','LoveClaw'].includes(message)) {
        session.state = UserState.PHONE;
        saveSessionsToFile([{ userId, session }]);
        return { text: '请输入你的手机号（用于登录和匹配通知）' };
      }
      if (message === '我的档案' || message === '查看档案') {
        // 优先用 session 中存储的 phone 查询，其次用 userId
        const phoneOrId = session.data.phone || userId;
        const profile = await cloudData.getProfile(phoneOrId);
        if (!profile) return { text: '你还没有报名，请先发送「启动爱情龙虾技能」' };
        return formatProfile(profile);
      }
      if (message === '取消报名') {
        const phoneOrId = session.data.phone || userId;
        const profile = await cloudData.getProfile(phoneOrId);
        if (!profile) return { text: '你还没有报名，无需取消' };
        await cloudData.deleteProfile(phoneOrId);
        resetUserSession(userId);
        resetUserSession(phoneOrId);
        return { text: '已取消报名，你的所有信息已删除。如需重新报名，请发送「启动爱情龙虾技能」。' };
      }
      return { text: '发送「启动爱情龙虾技能」开始缘分匹配，或「查看档案」查看你的信息' };
    }

    // ==================== PHONE ====================
    // 允许在任何非 NONE 状态重新开始
    if (['启动爱情龙虾技能','爱情龙虾','loveclaw','LoveClaw','/lc','/loveclaw','今日匹配','查看匹配','缘分匹配','八字匹配'].includes(message) && session.state !== UserState.NONE) {
      session.state = UserState.PHONE;
      session.data = { channel: session.data.channel };
      saveSessionsToFile([{ userId, session }]);
      return { text: '请输入你的手机号（用于登录和匹配通知）' };
    }
    if (/^1\d{10}$/.test(message) && session.state === UserState.PHONE) {
      const existing = await cloudData.getProfile(message).catch(() => null);
      if (existing) {
        // 已注册：加载已有档案进 session，跳到 CONFIRM 让用户选择
        session.data = { ...existing, phone: message };
        session.state = UserState.CONFIRM;
        saveSessionsToFile([{ userId, session }]);
        return {
          text: `📱 检测到该手机号已报名。\n\n${formatSummary(session.data).text}\n\n回复「确认」保持现有信息，或直接修改任意字段重新填写。`
        };
      }
      session.data.phone = message;
      // Keep BOTH keys (old userId AND phone) so subsequent messages from either ID work
      const oldUserId = [...userSessions.entries()].find(([k, v]) => v === session)?.[0];
      if (oldUserId && oldUserId !== message) {
        idMap[message] = oldUserId; // phone -> original userId
        userSessions.set(message, session); // also store under phone
        // Do NOT delete old key - keep both mappings active
      }
      session.state = UserState.NAME;
      saveSessionsToFile([{ userId, session }]);
      return { text: `手机号 ${message} 已绑定\n请输入你的姓名（或昵称）` };
    }

    // ==================== NAME ====================
    if (session.state === UserState.NAME) {
      session.data.name = message;
      session.state = UserState.GENDER;
      saveSessionsToFile([{ userId, session }]);
      return { text: '请选择你的性别：男 / 女' };
    }

    // ==================== GENDER ====================
    if (session.state === UserState.GENDER) {
      if (!['男', '女'].includes(message)) {
        return { text: '请回复「男」或「女」' };
      }
      session.data.gender = message;
      session.state = UserState.PREFERRED_GENDER;
      saveSessionsToFile([{ userId, session }]);
      return { text: `你的性别是${message}，希望认识什么性别？\n请回复：男 / 女 / 不限` };
    }

    // ==================== PREFERRED GENDER ====================
    if (session.state === UserState.PREFERRED_GENDER) {
      if (!['男', '女', '不限'].includes(message)) {
        return { text: '请回复「男」「女」或「不限」' };
      }
      session.data.preferredGender = message;
      session.state = UserState.BIRTH_DATE;
      saveSessionsToFile([{ userId, session }]);
      return { text: '请输入你的出生日期\n格式：YYYY-MM-DD\n例如：1995-05-20' };
    }

    // ==================== BIRTH DATE ====================
    if (session.state === UserState.BIRTH_DATE) {
      const bdMatch = message.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (!bdMatch) {
        return { text: '日期格式不正确，请使用 YYYY-MM-DD，例如：1995-05-20' };
      }
      const date = new Date(message);
      if (isNaN(date.getTime())) {
        return { text: '日期无效，请检查后重试' };
      }
      session.data.birthDate = message;
      session.data.birthDateObj = date;
      session.state = UserState.BIRTH_HOUR;
      saveSessionsToFile([{ userId, session }]);
      return { text: '请输入出生时辰（小时 0-23）\n例如：14 代表下午2点\n或输入地支：子、丑、寅、卯、辰、巳、午、未、申、酉、戌、亥' };
    }

    // ==================== BIRTH HOUR ====================
    if (session.state === UserState.BIRTH_HOUR) {
      const diZhiMap = { '子': 23, '丑': 1, '寅': 3, '卯': 5, '辰': 7, '巳': 9, '午': 11, '未': 13, '申': 15, '酉': 17, '戌': 19, '亥': 21 };
      const input = message.trim();
      let hour;
      if (/^\d{1,2}$/.test(input) && parseInt(input) >= 0 && parseInt(input) <= 23) {
        hour = parseInt(input);
      } else if (diZhiMap.hasOwnProperty(input)) {
        hour = diZhiMap[input];
      } else {
        return { text: '请输入 0-23 之间的数字，或地支（子丑寅卯辰巳午未申酉戌亥）' };
      }
      session.data.birthHour = hour;
      session.state = UserState.CITY;
      saveSessionsToFile([{ userId, session }]);
      return { text: '请输入你所在城市（例如：上海、北京、深圳）\n注意只写城市名，不要带「市」字' };
    }

    // ==================== CITY ====================
    if (session.state === UserState.CITY) {
      session.data.city = message;
      session.state = UserState.PHOTO;
      saveSessionsToFile([{ userId, session }]);
      return { text: '请发送一张照片用于匹配展示\n（可上传图片，或回复「跳过」不展示照片）' };
    }

    // ==================== PHOTO ====================
    if (session.state === UserState.PHOTO) {
      if (message !== '跳过') {
        try {
          // 确定本地文件路径（多种来源）
          // 1. mediaPath 参数（agent 传入的第4个参数）
          // 2. 从 [media attached: /path/...] 格式中提取
          // 3. message 本身是绝对路径
          let localPath = '';
          if (mediaPath && fs.existsSync(mediaPath)) {
            localPath = mediaPath;
          } else {
            const mediaMatch = message.match(/\[media attached:\s*([^\s(]+)/);
            if (mediaMatch && fs.existsSync(mediaMatch[1])) {
              localPath = mediaMatch[1];
            } else if (message.startsWith('/') && fs.existsSync(message)) {
              localPath = message;
            }
          }

          let photoInput;
          if (localPath) {
            // 读取本地文件转 base64
            const imgBuffer = fs.readFileSync(localPath);
            photoInput = imgBuffer.toString('base64');
            console.log('[PHOTO] read local file:', localPath, 'size:', imgBuffer.length);
          } else if (message.startsWith('http://') || message.startsWith('https://')) {
            photoInput = message; // URL，交给云函数 fetch
          } else {
            // 其他情况（如 image_key），跳过上传
            console.log('[PHOTO] unrecognized format, skipping:', message.substring(0, 60));
            photoInput = null;
          }

          if (photoInput) {
            const ossUrl = await cloudData.uploadPhoto(session.data.phone || userId, photoInput);
            session.data.photoOssUrl = ossUrl;
          }
        } catch (e) {
          console.error('[uploadPhoto error]', e.message);
        }
      }
      session.state = UserState.CONFIRM;
      saveSessionsToFile([{ userId, session }]);
      return formatSummary(session.data);
    }

    // ==================== CONFIRM ====================
    if (message === '确认' && session.state === UserState.CONFIRM) {
      // Channel from the current call's parameter (most reliable)
      const notifyChannel = session.data.channel || channel || 'webchat';
      try {
        // Calculate bazi
        const baziResult = bazi.calculateBazi(session.data.birthDate, session.data.birthHour);
        const profile = {
          ...session.data,
          userId: session.data.phone, // phone as primary ID
          channel: notifyChannel, // USE THE CHANNEL FROM SESSION (set during registration flow)
          bazi: baziResult,
          createdAt: new Date().toISOString(),
          todayMatchDone: false,
          todayMatchDate: '',
          matchedWith: '',
          matchedWithHistory: []
        };
        // 重试一次应对偶发 412/网络抖动
        let saveErr;
        for (let i = 0; i < 2; i++) {
          try { await cloudData.saveProfile(profile); saveErr = null; break; }
          catch (e) { saveErr = e; await new Promise(r => setTimeout(r, 1500)); }
        }
        if (saveErr) return { text: `保存遇到网络问题，请再回复一次「确认」重试` };
        // Clear session
        const phone = session.data.phone;
        saveSessionsToFile([{ userId, session: { state: UserState.NONE, data: { phone } } }]);
        delete idMap[phone];
        userSessions.delete(userId);
        userSessions.delete(phone);
        return {
          text: `报名成功！🎉\n\n已将你的信息纳入匹配队列，每日19:50自动匹配。\n匹配结果将于当晚8点通知你，请保持手机畅通。\n\n回复「我的档案」可查看个人信息`
        };
      } catch (e) {
        return { text: `保存遇到网络问题，请再回复一次「确认」重试` };
      }
    }

    // CONFIRM not matched but session is CONFIRM - show summary again
    if (session.state === UserState.CONFIRM) {
      return formatSummary(session.data);
    }

    // Fallback
    return { text: '请完成当前步骤，或发送「启动爱情龙虾技能」重新开始' };

  } catch (e) {
    return { text: '处理出错: ' + e.message };
  }
}

function formatSummary(data) {
  const genderText = data.gender === '男' ? '女性' : '男性';
  const bd = data.birthDate;
  const hour = data.birthHour;
  const baziPreview = tryBazi(data);
  return {
    text: `📋 信息确认\n\n姓名：${data.name}\n性别：${data.gender}，希望认识：${data.preferredGender}\n生日：${bd} ${data.birthHour}时\n城市：${data.city}\n${baziPreview}\n\n以上信息确认无误？确认报名请回复「确认」，修改请重新发送对应信息。`
  };
}

function tryBazi(data) {
  try {
    const result = bazi.calculateBazi(data.birthDate, data.birthHour);
    return `八字：${result.year}年 ${result.month}月 ${result.day}日 ${result.hour}时`;
  } catch {
    return '';
  }
}

function formatProfile(profile) {
  // bazi 可能是嵌套对象（注册时传入），也可能是分开字段（从云端读取）
  let baziStr = '未知';
  if (profile.bazi && profile.bazi.year) {
    baziStr = `${profile.bazi.year}年 ${profile.bazi.month}月 ${profile.bazi.day}日 ${profile.bazi.hour}时`;
  } else if (profile.baziYear) {
    baziStr = `${profile.baziYear}年 ${profile.baziMonth}月 ${profile.baziDay}日 ${profile.baziHour || ''}时`;
  }
  const matched = profile.matchedWithHistory || [];
  const matchedList = matched.length > 0
    ? matched.map(m => `  • ${m.userId} (${m.compatibility || ''})`).join('\n')
    : '暂无';
  return {
    text: `📋 你的档案\n\n姓名：${profile.name}\n性别：${profile.gender}，喜欢：${profile.preferredGender}\n生日：${profile.birthDate} ${profile.birthHour}时\n城市：${profile.city}\n八字：${baziStr}\n\n匹配历史：\n${matchedList}\n\n发送「启动爱情龙虾技能」可重新报名`
  };
}

function resetUserSession(userId) {
  userSessions.delete(userId);
}

// 定时任务由 SKILL.md 初始化规则注册（agent 执行 openclaw cron add）

module.exports = {
  handleMessage,
  resetUserSession,
  getUserSession: (uid) => userSessions.get(uid),
};
