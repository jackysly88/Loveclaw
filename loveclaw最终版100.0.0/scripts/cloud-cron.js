/**
 * LoveClaw - 云端版定时任务
 * 匹配逻辑在本地（skill）计算，FC 只负责存取数据
 */

const path = require('path');
process.chdir(path.join(process.env.HOME || '/root', '.openclaw', 'workspace'));

const cloudData = require('./cloud-data');
const bazi = require('./bazi');

const MATCH_THRESHOLD = 70; // 双向匹配阈值

/**
 * 从独立的年月日时字段构造 bazi 对象
 * 兼容数据库中 bazi 字段为空的情况
 */
function buildBaziObject(profile) {
  // 如果 bazi 字段已存在且有效，直接返回
  if (profile.bazi && typeof profile.bazi === 'object' && profile.bazi.yearGan) {
    return profile.bazi;
  }
  // 否则从独立字段构造
  return {
    yearGan: profile.baziYearGan || profile.baziYear?.replace(profile.baziYearZhi || '', '') || '',
    yearZhi: profile.baziYearZhi || profile.baziYear?.slice(-1) || '',
    monthGan: profile.baziMonthGan || profile.baziMonth?.replace(profile.baziMonthZhi || '', '') || '',
    monthZhi: profile.baziMonthZhi || profile.baziMonth?.slice(-1) || '',
    dayGan: profile.baziDayGan || profile.baziDay?.replace(profile.baziDayZhi || '', '') || '',
    dayZhi: profile.baziDayZhi || profile.baziDay?.slice(-1) || '',
    hourGan: profile.baziHourGan || profile.baziHour?.replace(profile.baziHourZhi || '', '') || '',
    hourZhi: profile.baziHourZhi || profile.baziHour?.slice(-1) || '',
  };
}

/**
 * 检查用户是否有有效的八字数据
 */
function hasValidBazi(profile) {
  const b = buildBaziObject(profile);
  return b.yearGan && b.yearZhi && b.monthGan && b.monthZhi && b.dayGan && b.dayZhi && b.hourGan && b.hourZhi;
}

/**
 * 计算双向匹配分数（使用 match.js 的算法）
 */
function calculateMutualScore(baziA, baziB) {
  if (!baziA || !baziB) return { scoreAToB: 0, scoreBToA: 0, isMutual: false, mutualScore: 0 };
  const scoreAToB = bazi.calculateMatchScore(baziA, baziB);
  const scoreBToA = bazi.calculateMatchScore(baziB, baziA);
  const isMutual = scoreAToB >= MATCH_THRESHOLD && scoreBToA >= MATCH_THRESHOLD;
  const mutualScore = Math.min(scoreAToB, scoreBToA);
  return { scoreAToB, scoreBToA, isMutual, mutualScore };
}

/**
 * 执行每日匹配（基于 TableStore，云端计算）
 */
async function runDailyMatching() {
  console.log('[匹配任务] 开始执行...');

  const profiles = await cloudData.getAllProfiles();
  console.log(`[匹配任务] 当前用户数: ${profiles.length}`);

  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().split('T')[0];
  const matchedSet = new Set();
  const results = [];

  for (const profile of profiles) {
    // 跳过已匹配的用户
    if (matchedSet.has(profile.userId)) continue;
    // 跳过今日已匹配的用户
    if (profile.todayMatchDone === '1' && profile.todayMatchDate === today) {
      matchedSet.add(profile.userId);
      continue;
    }
    // 跳过缺少关键信息的用户
    if (!hasValidBazi(profile) || !profile.city || !profile.gender || !profile.preferredGender) continue;

    // 查找最佳同城双向匹配
    const cands = profiles.filter(p => {
      if (matchedSet.has(p.userId)) return false;
      if (p.userId === profile.userId) return false;
      if (!hasValidBazi(p) || !p.city) return false;
      // 同城
      if (p.city !== profile.city) return false;
      // 双向喜欢
      if (p.gender !== profile.preferredGender) return false;
      if (p.preferredGender !== profile.gender) return false;
      return true;
    });

    if (!cands.length) continue;

    // 计算每个候选的匹配分数（从独立字段构造 bazi 对象）
    const profileBazi = buildBaziObject(profile);
    const scored = cands.map(c => {
      const score = calculateMutualScore(profileBazi, buildBaziObject(c));
      return { candidate: c, ...score };
    }).filter(s => s.isMutual);

    if (!scored.length) continue;

    // 取分数最高者
    scored.sort((a, b) => b.mutualScore - a.mutualScore);
    const best = scored[0];

    console.log(`[匹配任务] ${profile.name} ↔ ${best.candidate.name} (${best.mutualScore}分, ${profile.city})`);

    // 构建历史记录
    const uHist = Array.isArray(profile.matchedWithHistory) ? profile.matchedWithHistory : [];
    uHist.push({ userId: best.candidate.userId, date: today });
    const pHist = Array.isArray(best.candidate.matchedWithHistory) ? best.candidate.matchedWithHistory : [];
    pHist.push({ userId: profile.userId, date: today });

    // 保存双方匹配结果
    const [uSave, pSave] = await Promise.all([
      cloudData.saveMatch(profile.userId, best.candidate.userId, uHist),
      cloudData.saveMatch(best.candidate.userId, profile.userId, pHist),
    ]);

    if (uSave.success && pSave.success) {
      console.log(`[匹配任务] ✅ ${profile.name} 和 ${best.candidate.name} 匹配成功（${best.mutualScore}分）`);
      results.push({ user: profile.name, partner: best.candidate.name, score: best.mutualScore });
    } else {
      console.error(`[匹配任务] ❌ 保存失败: ${profile.userId}->${best.candidate.userId}`, uSave.error, pSave.error);
    }

    matchedSet.add(profile.userId);
    matchedSet.add(best.candidate.userId);
  }

  console.log(`[匹配任务] 完成，共 ${results.length} 对匹配`);
  return results;
}

/**
 * 发送通知
 */
async function notifyUser(channel, target, text) {
  try {
    const { message } = require('openclaw');
    if (channel && target) {
      await message({ action: 'send', channel, target, message: text });
    }
  } catch(e) {
    console.error('[通知失败]', e.message);
  }
}

/**
 * 生成晚8点报告
 */
async function runEveningReports() {
  console.log('[报告任务] 开始生成...');

  try {
    const data = await cloudData.apiRequest('/api/report');
    const matchedUsers = (data.matches || []).filter(m => !m.reported);

    for (const m of matchedUsers) {
      const target = m.notificationTarget || m.userId;
      if (!m.channel || !target) {
        console.log('[报告任务] 跳过（无通知目标）:', m.userId);
        continue;
      }

      // 构建报告文本
      const photoLine = m.partnerPhotoOssUrl ? `📸 照片：${m.partnerPhotoOssUrl}\n` : '';
      const report = `🌟 今日缘分报告\n\n` +
        `你好 ${m.name || ''}，今日为你找到了一位缘分匹配！\n\n` +
        `📍 城市：${m.city || '未知'}\n` +
        `💕 对方姓名：${m.partnerName || '未知'}\n` +
        `📱 对方手机：${m.partnerPhone || '未知'}\n` +
        `${photoLine}` +
        `\n快去联系ta吧！祝你们有美好的缘分 🍀`;

      await notifyUser(m.channel, target, report);
      console.log(`[报告任务] 已发送给 ${m.name}(${m.userId}) -> ${m.partnerName}`);
    }

    if (matchedUsers.length === 0) {
      console.log('[报告任务] 今日无匹配用户');
    } else {
      console.log(`[报告任务] 已发送 ${matchedUsers.length} 份报告`);
    }
  } catch(e) {
    console.error('[报告任务] 失败:', e.message);
  }
}

// ========================
// CLI 入口
// ========================
const [, , command] = process.argv;

if (command === 'match') {
  runDailyMatching().then(() => process.exit(0)).catch(e => {
    console.error('[匹配任务异常]', e);
    process.exit(1);
  });
} else if (command === 'report') {
  runEveningReports().then(() => process.exit(0)).catch(e => {
    console.error('[报告任务异常]', e);
    process.exit(1);
  });
} else {
  console.log('用法: node cloud-cron.js [match|report]');
  process.exit(1);
}
