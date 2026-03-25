/**
 * 八字缘分匹配 - 云端版会话处理 v1.3.0
 * 简化流程：手机号即账号，匹配后才能看到对方信息
 */

const cloudData = require('./cloud-data');
const bazi = require('./bazi');
const match = require('./match');

// 用户会话
const userSessions = new Map();

// 用户状态
const UserState = {
  NONE: 'none',
  PHONE_LOOKUP: 'phone_lookup', // 通过手机号查找
  PHONE: 'phone',           // 等待手机号
  NAME: 'name',
  GENDER: 'gender',
  PREFERRED_GENDER: 'preferred_gender',
  BIRTH_DATE: 'birth_date',
  BIRTH_HOUR: 'birth_hour',
  LOCATION: 'location',
  PHOTO: 'photo',
  CONFIRM: 'confirm'
};

const STATE_QUESTIONS = {
  [UserState.PHONE_LOOKUP]: '请输入已报名的手机号',
  [UserState.PHONE]: '请输入你的手机号（用于登录和匹配通知）',
  [UserState.NAME]: '请输入你的姓名（仅用于匹配显示）',
  [UserState.GENDER]: '你的性别是？\n1️⃣ 男\n2️⃣ 女',
  [UserState.PREFERRED_GENDER]: '你希望匹配什么性别？\n1️⃣ 男\n2️⃣ 女',
  [UserState.BIRTH_DATE]: '请输入出生日期\n格式：YYYY-MM-DD\n例如：1995-06-15',
  [UserState.BIRTH_HOUR]: '请输入出生时辰（小时）\n例如：14 代表下午2点',
  [UserState.LOCATION]: '你的居住城市是？',
  [UserState.PHOTO]: '请发送一张照片（匹配时展示）\n\n输入「跳过」不使用照片'
};

const GENDER_MAP = { '1': 'male', '2': 'female', '男': 'male', '女': 'female' };
const GENDER_DISPLAY = { 'male': '男', 'female': '女' };

function getUserSession(userId) {
  if (!userSessions.has(userId)) {
    userSessions.set(userId, { state: UserState.NONE, data: {} });
  }
  return userSessions.get(userId);
}

function resetUserSession(userId) {
  userSessions.set(userId, { state: UserState.NONE, data: {} });
}

async function handleMessage(userId, message) {
  const session = getUserSession(userId);
  
  // ==================== 独立命令 ====================
  
  // 手机号登录
  if (message === '手机号登录') {
    session.state = UserState.PHONE_LOOKUP;
    return { text: STATE_QUESTIONS[UserState.PHONE_LOOKUP] };
  }

  // 开启匹配 / 报名
  if (message === '开启匹配' || message === '报名' || message === '加入匹配') {
    // 检查是否已注册
    const existing = await cloudData.getProfile(userId);
    if (existing && existing.name) {
      session.data = existing;
      return {
        text: `📋 您已报名

姓名：${existing.name}
性别：${GENDER_DISPLAY[existing.gender]}
八字：${existing.bazi?.year || '?'}年

回复「今日匹配」查看结果，或「修改」更新信息`
      };
    }
    
    // 新用户，输入手机号
    session.state = UserState.PHONE;
    session.data = { userId };
    return { text: STATE_QUESTIONS[UserState.PHONE] };
  }
  
  // 我的档案
  if (message === '我的档案' || message === '查看档案') {
    let profile = session.data && session.data.userId ? session.data : null;
    if (!profile || !profile.name) {
      profile = await cloudData.getProfile(userId);
    }
    if (!profile || !profile.name) {
      return { text: '您还未报名，请输入「开启匹配」开始报名' };
    }
    const phoneHide = profile.phone ? profile.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '未填写';
    return {
      text: `📋 您的信息

姓名：${profile.name}
性别：${GENDER_DISPLAY[profile.gender]}
八字：${profile.bazi?.year || '?'}年 ${profile.bazi?.month || '?'}月 ${profile.bazi?.day || '?'}日 ${profile.bazi?.hour || '?'}时
手机号：${phoneHide}
城市：${profile.city || profile.location || '未填写'}`
    };
  }
  
  // 今日匹配 - 核心功能
  if (message === '今日匹配' || message === '查看匹配') {
    // 优先使用会话中已登录的 profile（手机号登录后）
    let profile = session.data && session.data.userId ? session.data : null;
    if (!profile || !profile.name) {
      profile = await cloudData.getProfile(userId);
    }
    if (!profile || !profile.name) {
      return { text: '请先「开启匹配」报名' };
    }
    
    // 检查是否已匹配
    if (!profile.todayMatchDone || profile.todayMatchDone === '0') {
      return { text: '✨ 今日暂无匹配\n\n命运的齿轮正在转动...\n\n每日 19:50 自动匹配，明天再来看看！' };
    }
    
    // 获取匹配对象 - 这里才能看到对方手机号！
    const partner = await cloudData.getProfile(profile.matchedWith);
    if (!partner) {
      return { text: '匹配数据异常，请联系客服' };
    }
    
    return {
      text: `🌟 今日匹配成功！

【对方信息】
📛 姓名：${partner.name || '匿名'}
📱 手机号：${partner.phone || '未填写'}
📍 城市：${partner.city || partner.location || '未知'}
🏠 八字：${partner.bazi?.year || '?'}年 ${partner.bazi?.month || '?'}月

💕 祝有缘人终成眷属！

— 爱情龙虾`
    };
  }
  
  // 取消报名
  if (message === '取消报名') {
    const delId = session.data?.userId || userId;
    await cloudData.deleteProfile(delId);
    resetUserSession(userId);
    return { text: '✅ 已取消报名，有缘再见！' };
  }
  
  // 修改信息
  if (message === '修改' || message === '修改信息') {
    let profile = session.data && session.data.userId ? session.data : null;
    if (!profile || !profile.name) {
      profile = await cloudData.getProfile(userId);
    }
    if (profile) {
      session.data = { ...profile };
    } else {
      session.data = { userId };
    }
    session.state = UserState.NAME;
    return { text: STATE_QUESTIONS[UserState.NAME] };
  }
  
  // ==================== 状态机 ====================
  
  // 手机号查找
  if (session.state === UserState.PHONE_LOOKUP) {
    if (!/^1\d{10}$/.test(message)) {
      return { text: '❌ 手机号格式错误，请重新输入' };
    }
    const profile = await cloudData.getProfileByPhone(message);
    if (profile && profile.name) {
      session.data = profile;
      session.state = UserState.NONE;
      return {
        text: `✅ 登录成功！

【${profile.name}】欢迎回来！

请选择：
• 输入「今日匹配」查看匹配结果
• 输入「我的档案」查看信息
• 输入「修改」更新信息`
      };
    } else {
      return { text: '❌ 该手机号未报名，请先「开启匹配」' };
    }
  }

  // 输入手机号
  if (session.state === UserState.PHONE) {
    if (!/^1\d{10}$/.test(message)) {
      return { text: '❌ 手机号格式错误，请重新输入' };
    }
    session.data.phone = message;
    session.state = UserState.NAME;
    return { text: STATE_QUESTIONS[UserState.NAME] };
  }
  
  // 输入姓名
  if (session.state === UserState.NAME) {
    session.data.name = message.trim();
    session.state = UserState.GENDER;
    return { text: STATE_QUESTIONS[UserState.GENDER] };
  }
  
  // 输入性别
  if (session.state === UserState.GENDER) {
    const gender = GENDER_MAP[message];
    if (!gender) return { text: '请回复 1 或 2' };
    session.data.gender = gender;
    session.state = UserState.PREFERRED_GENDER;
    return { text: STATE_QUESTIONS[UserState.PREFERRED_GENDER] };
  }
  
  // 输入希望匹配的性别
  if (session.state === UserState.PREFERRED_GENDER) {
    const preferredGender = GENDER_MAP[message];
    if (!preferredGender) return { text: '请回复 1 或 2' };
    session.data.preferredGender = preferredGender;
    session.state = UserState.BIRTH_DATE;
    return { text: STATE_QUESTIONS[UserState.BIRTH_DATE] };
  }
  
  // 输入出生日期
  if (session.state === UserState.BIRTH_DATE) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(message)) {
      return { text: '日期格式错误，使用 YYYY-MM-DD 格式\n例如：1995-06-15' };
    }
    session.data.birthDate = message;
    session.state = UserState.BIRTH_HOUR;
    return { text: STATE_QUESTIONS[UserState.BIRTH_HOUR] };
  }
  
  // 输入出生时辰
  if (session.state === UserState.BIRTH_HOUR) {
    const hour = parseInt(message);
    if (isNaN(hour) || hour < 0 || hour > 23) {
      return { text: '请输入 0-23 之间的数字\n例如：14 代表下午2点' };
    }
    session.data.birthHour = hour;
    session.state = UserState.LOCATION;
    return { text: STATE_QUESTIONS[UserState.LOCATION] };
  }
  
  // 输入城市
  if (session.state === UserState.LOCATION) {
    session.data.location = message.trim();
    session.state = UserState.PHOTO;
    return { text: STATE_QUESTIONS[UserState.PHOTO] };
  }
  
  // 照片
  if (session.state === UserState.PHOTO) {
    if (message === '跳过') {
      session.data.photoSkipped = true;
      session.state = UserState.CONFIRM;
    } else {
      // 照片由 handlePhoto 处理
      return { text: STATE_QUESTIONS[UserState.PHOTO] };
    }
  }
  
  // 确认报名
  if (session.state === UserState.CONFIRM) {
    if (message === '确认') {
      // 计算八字
      const baziResult = bazi.calculateBazi(session.data.birthDate, session.data.birthHour);
      
      const profile = {
        ...session.data,
        userId,
        bazi: baziResult,
        createdAt: new Date().toISOString(),
        todayMatchDone: false,
        todayMatchDate: '',
        matchedWith: '',
        matchedWithHistory: []
      };
      
      await cloudData.saveProfile(profile);
      session.state = UserState.NONE;
      
      return {
        text: `🎉 报名成功！

【${profile.name}】的命运齿轮开始转动...

📅 每日 19:50 自动匹配
📬 匹配成功者每晚 8 点收到通知

输入「今日匹配」看看今天的缘分！`
      };
    } else if (message === '修改') {
      session.state = UserState.NAME;
      return { text: STATE_QUESTIONS[UserState.NAME] };
    } else {
      return { text: '回复「确认」完成报名，或「修改」重新填写' };
    }
  }
  
  // 默认
  return {
    text: `👋 欢迎使用「八字缘分匹配」！

请选择：
• 输入「开启匹配」开始报名
• 输入「我的档案」查看信息
• 输入「今日匹配」查看匹配结果`
  };
}

async function handlePhoto(userId, photoData) {
  const session = getUserSession(userId);
  if (session.state !== UserState.PHOTO) {
    return '请先完成报名';
  }
  
  try {
    const result = await cloudData.uploadPhoto(userId, photoData);
    if (result && result.ossUrl) {
      session.data.photoOssUrl = result.ossUrl;
    }
  } catch (e) {
    console.error('照片上传失败:', e);
  }
  
  session.state = UserState.CONFIRM;
  const phoneHide = session.data.phone ? session.data.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '';
  return `📋 请确认信息：

姓名：${session.data.name}
性别：${GENDER_DISPLAY[session.data.gender]}
手机号：${phoneHide}
出生：${session.data.birthDate} ${session.data.birthHour}:00
城市：${session.data.location}

回复「确认」或「修改」`;
}

module.exports = {
  handleMessage,
  handlePhoto,
  getUserSession,
  resetUserSession,
  UserState
};
