/**
 * 八字缘分匹配 - 主会话处理模块
 * 处理用户对话流程
 */

const path = require('path');
const fs = require('fs');

// 引入云端数据模块
const cloudDataPath = path.join(__dirname, 'cloud-data');
const baziPath = path.join(__dirname, 'bazi');
const matchPath = path.join(__dirname, 'match');

let data, bazi, match;

try {
  data = require(cloudDataPath);
  bazi = require(baziPath);
  match = require(matchPath);
} catch (e) {
  console.error('模块加载失败:', e.message);
}

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
const GENDER_MAP = { '1': 'male', '2': 'female' };
const GENDER_DISPLAY = { 'male': '男', 'female': '女' };

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
 * 处理用户消息
 */
async function handleMessage(userId, message, userName = '用户') {
  const session = getUserSession(userId);
  
  // 检查是否是命令
  if (message === '取消报名') {
    data.deleteProfile(userId);
    resetUserSession(userId);
    return { 
      text: '您的报名信息已删除。如需重新报名，请输入「开启匹配」。' 
    };
  }
  
  if (message === '我的档案') {
    const profile = data.getProfile(userId);
    if (!profile) {
      return { text: '您还未报名，请输入「开启匹配」开始报名。' };
    }
    
    const phoneDisplay = profile.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
    const bazi = profile.bazi;
    
    return {
      text: `📋 您的报名信息\n\n姓名：${profile.name}\n性别：${GENDER_DISPLAY[profile.gender]}\n匹配性别：${GENDER_DISPLAY[profile.preferredGender]}\n手机号：${phoneDisplay}\n出生：${profile.birthDate} ${profile.birthHour}:00\n居住地：${profile.location}\n\n八字：${bazi.year} | ${bazi.month} | ${bazi.day} | ${bazi.hour}`
    };
  }
  
  if (message === '今日匹配') {
    const todayMatch = data.getUserTodayMatch(userId);
    if (!todayMatch) {
      return { text: '今日暂无匹配结果，请稍后再试。' };
    }
    
    const partnerId = todayMatch.userId1 === userId 
      ? todayMatch.userId2 
      : todayMatch.userId1;
    const partner = data.getProfile(partnerId);
    
    if (!partner) {
      return { text: '匹配数据异常，请联系客服。' };
    }
    
    const report = match.formatMatchReport(
      userId,
      {
        name: partner.name,
        phone: partner.phone,
        location: partner.location,
        photo: partner.photo
      },
      { 
        score: todayMatch.compatibility,
        columns: {
          year: { score: 80, bazi1: '', bazi2: '' },
          month: { score: 75, bazi1: '', bazi2: '' },
          day: { score: 85, bazi1: '', bazi2: '' },
          hour: { score: 70, bazi1: '', bazi2: '' }
        },
        interpretation: '缘分已到！'
      },
      true
    );
    
    return { text: report };
  }
  
  // 报名流程
  if (message === '开启匹配' || message === '报名' || message === '加入匹配') {
    const existing = data.getProfile(userId);
    if (existing) {
      session.state = UserState.CONFIRM;
      session.data = existing;
      return {
        text: `📋 您已报名过，是否修改信息？\n\n姓名：${existing.name}\n性别：${GENDER_DISPLAY[existing.gender]}\n\n回复「修改」重新填写，或「保持」保留现有信息`
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
      // 照片在下一步确认
      session.data.photoReceived = true;
      session.state = UserState.CONFIRM;
      return buildConfirmMessage(session.data);
      
    case UserState.CONFIRM:
      if (message === '确认') {
        // 计算八字
        const baziResult = bazi.calculateBazi(
          session.data.birthDate,
          session.data.birthHour
        );
        
        // 保存档案
        const profile = {
          userId,
          name: session.data.name,
          gender: session.data.gender,
          preferredGender: session.data.preferredGender,
          phone: session.data.phone,
          birthDate: session.data.birthDate,
          birthHour: session.data.birthHour,
          location: session.data.location,
          bazi: baziResult,
          createdAt: new Date().toISOString(),
          todayMatchDone: false
        };
        
        data.saveProfile(profile);
        resetUserSession(userId);
        
        return {
          text: `🦞 爱情龙虾出动，命运的齿轮开始转动！\n\n✅ 您已报名成功，报名成功后每晚20点将会收到匹配信息！\n\n你的八字：年柱 ${baziResult.year} | 月柱 ${baziResult.month} | 日柱 ${baziResult.day} | 时柱 ${baziResult.hour}\n\n系统将在每晚 8 点为你寻找有缘人...\n今日匹配结果将于明晚 8 点公布\n\n输入「我的档案」查看信息\n输入「今日匹配」查看今日结果`
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
  
  // 保存照片
  const photoPath = data.savePhoto(userId, photoData);
  session.data.photoPath = photoPath;
  session.state = UserState.CONFIRM;
  
  return buildConfirmMessage(session.data);
}

/**
 * 构建确认消息
 */
function buildConfirmMessage(data) {
  const phoneDisplay = data.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
  
  let text = `📋 请确认你的信息：

姓名：${data.name}
性别：${GENDER_DISPLAY[data.gender]}
匹配性别：${GENDER_DISPLAY[data.preferredGender]}
手机号：${phoneDisplay}
出生：${data.birthDate} ${data.birthHour}:00
居住地：${data.location}

回复「确认」完成报名，或「修改」重新填写`;
  
  return { text };
}

module.exports = {
  handleMessage,
  handlePhoto,
  getUserSession,
  resetUserSession,
  UserState
};
