/**
 * 八字缘分匹配 - 云端版会话处理
 * 使用 Firebase 作为数据存储
 */

const path = require('path');
const fs = require('fs');

// 引入云端数据模块
const cloudData = require('./cloud-data');
const bazi = require('./bazi');
const match = require('./match');

// 会话状态
const userSessions = new Map();

// 用户状态枚举
const UserState = {
  NONE: 'none',
  START: 'start',
  NAME: 'name',
  GENDER: 'gender',
  PREFERRED_GENDER: 'preferred_gender',
  PHONE: 'phone',
  BIRTH_DATE: 'birth_date',
  BIRTH_HOUR: 'birth_hour',
  LOCATION: 'location',
  PHOTO: 'photo',
  CONFIRM: 'confirm'
};

// 状态问题
const STATE_QUESTIONS = {
  [UserState.NAME]: '请输入你的姓名（仅用于匹配显示）',
  [UserState.GENDER]: '你的性别是？\n1️⃣ 男\n2️⃣ 女',
  [UserState.PREFERRED_GENDER]: '你希望匹配什么性别？\n1️⃣ 男\n2️⃣ 女',
  [UserState.PHONE]: '请输入手机号（匹配成功后可见）',
  [UserState.BIRTH_DATE]: '请输入出生日期\n格式：YYYY-MM-DD\n例如：1995-06-15',
  [UserState.BIRTH_HOUR]: '请输入出生时辰（小时）\n例如：14 代表下午2点',
  [UserState.LOCATION]: '你的居住城市是？',
  [UserState.PHOTO]: '请发送一张照片（匹配时展示）'
};

// 性别选项
const GENDER_MAP = { '1': 'male', '2': 'female', '男': 'male', '女': 'female' };
const GENDER_DISPLAY = { 'male': '男', 'female': '女' };

// 启动检查标志
let startupCheckDone = false;

/**
 * OpenClaw 启动时检查：如果今天还没匹配，自动运行匹配
 */
async function checkAndRunDailyMatchIfNeeded() {
  if (startupCheckDone) return;
  startupCheckDone = true;
  
  try {
    const profiles = cloudData.getAllProfiles();
    if (profiles.length === 0) return;
    
    // 检查是否有用户今天还未匹配
    const today = new Date().toISOString().split('T')[0];
    const usersNeedMatch = profiles.filter(p => 
      !p.todayMatchDone || p.todayMatchDate !== today
    );
    
    if (usersNeedMatch.length === 0) {
      console.log('[启动检查] 今日匹配已完成，无需重复运行');
      return;
    }
    
    console.log(`[启动检查] 发现 ${usersNeedMatch.length} 位用户需要匹配，正在运行...`);
    
    // 运行每日匹配
    const matchModule = require('./match');
    const result = matchModule.runAllDailyMatches();
    console.log(`[启动检查] 匹配完成: ${result.todayMatch.length} 对匹配`);
    
  } catch (e) {
    console.error('[启动检查] 匹配失败:', e.message);
  }
}

/**
 * 获取用户会话
 */
function getUserSession(userId) {
  if (!userSessions.has(userId)) {
    userSessions.set(userId, {
      state: UserState.NONE,
      data: {}
    });
  }
  return userSessions.get(userId);
}

/**
 * 重置用户会话
 */
function resetUserSession(userId) {
  userSessions.set(userId, {
    state: UserState.NONE,
    data: {}
  });
}

/**
 * 构建确认消息
 */
function buildConfirmMessage(data) {
  const phoneDisplay = data.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
  
  return `📋 请确认你的信息：

姓名：${data.name}
性别：${GENDER_DISPLAY[data.gender]}
匹配性别：${GENDER_DISPLAY[data.preferredGender]}
手机号：${phoneDisplay}
出生：${data.birthDate} ${data.birthHour}:00
居住地：${data.location}

回复「确认」完成报名，或「修改」重新填写`;
}

/**
 * 处理用户消息
 */
async function handleMessage(userId, message, context = {}) {
  const session = getUserSession(userId);
  
  // 命令处理
  if (message === '取消报名') {
    await cloudData.deleteProfile(userId);
    resetUserSession(userId);
    return { 
      text: '您的报名信息已删除。如需重新报名，请输入「开启匹配」。' 
    };
  }
  
  if (message === '我的档案') {
    const profile = await cloudData.getProfile(userId);
    if (!profile) {
      return { text: '您还未报名，请输入「开启匹配」开始报名。' };
    }
    
    const phoneDisplay = profile.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
    
    return {
      text: `📋 您的报名信息

姓名：${profile.name}
性别：${GENDER_DISPLAY[profile.gender]}
匹配性别：${GENDER_DISPLAY[profile.preferredGender]}
手机号：${phoneDisplay}
出生：${profile.birthDate} ${profile.birthHour}:00
居住地：${profile.location}

八字：${profile.bazi.year} | ${profile.bazi.month} | ${profile.bazi.day} | ${profile.bazi.hour}`
    };
  }
  
  if (message === '今日匹配') {
    const todayMatch = await cloudData.getUserTodayMatch(userId);
    if (!todayMatch) {
      return { text: '今日暂无匹配结果，明日再来看看~ 🌙' };
    }
    
    const partnerId = todayMatch.userId1 === userId 
      ? todayMatch.userId2 
      : todayMatch.userId1;
    const partner = await cloudData.getProfile(partnerId);
    
    if (!partner) {
      return { text: '匹配数据异常，请联系客服。' };
    }
    
    return {
      text: `🌟 今日匹配结果

与 ${partner.name} 的匹配度：${todayMatch.compatibility}%

📱 手机：${partner.phone}
📍 位置：${partner.city || partner.location}

💫 八字分析：
${todayMatch.baziAnalysis || '缘分已到！'}

输入「详细匹配」查看完整报告`
    };
  }
  
  if (message === '详细匹配') {
    const todayMatch = await cloudData.getUserTodayMatch(userId);
    if (!todayMatch) {
      return { text: '今日暂无匹配结果。' };
    }
    
    const partnerId = todayMatch.userId1 === userId 
      ? todayMatch.userId2 
      : todayMatch.userId1;
    const partner = await cloudData.getProfile(partnerId);
    const myProfile = await cloudData.getProfile(userId);
    
    if (!partner || !myProfile) {
      return { text: '数据异常。' };
    }
    
    let report = `🌟 缘分报告 - ${new Date().toLocaleDateString('zh-CN')}

【匹配对象】
📛 ${partner.name}
📱 ${partner.phone}
📍 ${partner.city || partner.location}

【匹配详情】
总匹配度：${todayMatch.compatibility}%

💫 八字分析：
年柱：${myProfile.bazi.year} 🆚 ${partner.bazi.year}
月柱：${myProfile.bazi.month} 🆚 ${partner.bazi.month}
日柱：${myProfile.bazi.day} 🆚 ${partner.bazi.day}
时柱：${myProfile.bazi.hour} 🆚 ${partner.bazi.hour}

💬 ${todayMatch.interpretation || '你们的缘分很深！'}`;
    
    return { text: report };
  }
  
  // 报名流程
  if (message === '开启匹配' || message === '报名' || message === '加入匹配') {
    const existing = await cloudData.getProfile(userId);
    
    if (existing) {
      session.data = existing;
      session.state = UserState.CONFIRM;
      return {
        text: `📋 您已报名过

姓名：${existing.name}
性别：${GENDER_DISPLAY[existing.gender]}
八字：${existing.bazi.year} | ${existing.bazi.month} | ${existing.bazi.day} | ${existing.bazi.hour}

回复「修改」重新填写，或「保持」保留现有信息`
      };
    }
    
    session.state = UserState.START;
    return {
      text: `🌟 欢迎来到「八字缘分匹配」！

在这里，我们将根据你的出生时辰为你寻找有缘人。

【匹配规则】
• 每日最多匹配一次
• 匹配基于八字五行相生相克
• 匹配成功者每晚 8 点收到报告
• 你的信息仅用于匹配，不会公开

回复「开始报名」继续`
    };
  }
  
  if (message === '开始报名') {
    session.state = UserState.NAME;
    session.data = {};
    return { text: STATE_QUESTIONS[UserState.NAME] };
  }
  
  if (message === '修改') {
    session.state = UserState.NAME;
    session.data = {};
    return { text: STATE_QUESTIONS[UserState.NAME] };
  }
  
  if (message === '保持') {
    return { text: '您的信息已保持。如需查看，请输入「我的档案」。' };
  }
  
  if (message === 'stats') {
    // 管理员命令：查看当前用户数
    const profiles = await cloudData.getAllProfiles();
    return { text: `📊 当前报名人数：${profiles.length} 人` };
  }
  
  // 状态机处理
  switch (session.state) {
    case UserState.START:
      if (message === '开始报名') {
        session.state = UserState.NAME;
        return { text: STATE_QUESTIONS[UserState.NAME] };
      }
      break;
      
    case UserState.NAME:
      session.data.name = message.trim();
      session.state = UserState.GENDER;
      return { text: STATE_QUESTIONS[UserState.GENDER] };
      
    case UserState.GENDER:
      const gender = GENDER_MAP[message];
      if (!gender) {
        return { text: '请回复 1 或 2' };
      }
      session.data.gender = gender;
      session.state = UserState.PREFERRED_GENDER;
      return { text: STATE_QUESTIONS[UserState.PREFERRED_GENDER] };
      
    case UserState.PREFERRED_GENDER:
      const preferredGender = GENDER_MAP[message];
      if (!preferredGender) {
        return { text: '请回复 1 或 2' };
      }
      session.data.preferredGender = preferredGender;
      session.state = UserState.PHONE;
      return { text: STATE_QUESTIONS[UserState.PHONE] };
      
    case UserState.PHONE:
      if (!/^1\d{10}$/.test(message)) {
        return { text: '手机号格式错误，请重新输入' };
      }
      session.data.phone = message;
      session.state = UserState.BIRTH_DATE;
      return { text: STATE_QUESTIONS[UserState.BIRTH_DATE] };
      
    case UserState.BIRTH_DATE:
      if (!/^\d{4}-\d{2}-\d{2}$/.test(message)) {
        return { text: '日期格式错误，请使用 YYYY-MM-DD 格式' };
      }
      session.data.birthDate = message;
      session.state = UserState.BIRTH_HOUR;
      return { text: STATE_QUESTIONS[UserState.BIRTH_HOUR] };
      
    case UserState.BIRTH_HOUR:
      const hour = parseInt(message);
      if (isNaN(hour) || hour < 0 || hour > 23) {
        return { text: '小时格式错误，请输入 0-23 之间的数字' };
      }
      session.data.birthHour = hour;
      session.state = UserState.LOCATION;
      return { text: STATE_QUESTIONS[UserState.LOCATION] };
      
    case UserState.LOCATION:
      session.data.location = message.trim();
      session.state = UserState.PHOTO;
      return { text: STATE_QUESTIONS[UserState.PHOTO] + '\n\n（请直接发送图片）' };
      
    case UserState.PHOTO:
      // 等待照片
      return { text: '请发送一张照片' };
      
    case UserState.CONFIRM:
      if (message === '确认') {
        // 计算八字
        const baziResult = bazi.calculateBazi(
          session.data.birthDate,
          session.data.birthHour
        );
        
        // 生成用户ID
        const finalUserId = userId || cloudData.generateUserId({ userId });
        
        // 获取已有档案，保留重要字段
        const existingProfile = cloudData.getProfile(finalUserId) || {};
        
        // 保存档案到云端（保留匹配历史等重要字段）
        const profile = {
          ...existingProfile,  // 保留原有字段
          userId: finalUserId,
          name: session.data.name,
          gender: session.data.gender,
          preferredGender: session.data.preferredGender,
          phone: session.data.phone,
          birthDate: session.data.birthDate,
          birthHour: session.data.birthHour,
          location: session.data.location,
          bazi: baziResult,
          createdAt: existingProfile.createdAt || new Date().toISOString(),
          todayMatchDate: existingProfile.todayMatchDate || null,
          lastMatchDate: existingProfile.lastMatchDate || null
        };
        
        await cloudData.saveProfile(profile);
        resetUserSession(userId);
        
        return {
          text: `🦞 爱情龙虾出动，命运的齿轮开始转动！\n\n✅ 您已报名成功！\n\n📅 每日流程：\n• 19:50 自动匹配有缘人\n• 20:00 推送匹配报告\n\n你的八字：\n年柱 ${baziResult.year}\n月柱 ${baziResult.month}\n日柱 ${baziResult.day}\n时柱 ${baziResult.hour}\n\n每日限匹配一人！输入「我的档案」查看信息`
        };
      } else if (message === '修改') {
        session.state = UserState.NAME;
        return { text: STATE_QUESTIONS[UserState.NAME] };
      }
      return { text: '请回复「确认」或「修改」' };
  }
  
  return null;
}

/**
 * 处理用户照片
 */
async function handlePhoto(userId, photoData) {
  const session = getUserSession(userId);
  
  if (session.state !== UserState.PHOTO) {
    return null;
  }
  
  // 保存照片到本地
  const photoPath = cloudData.savePhoto(userId, photoData);
  session.data.photoPath = photoPath;
  session.state = UserState.CONFIRM;
  
  return buildConfirmMessage(session.data);
}

// 启动时自动检查并运行匹配
checkAndRunDailyMatchIfNeeded();

module.exports = {
  handleMessage,
  handlePhoto,
  getUserSession,
  resetUserSession,
  UserState,
  checkAndRunDailyMatchIfNeeded
};
