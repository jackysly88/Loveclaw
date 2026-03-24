/**
 * 八字缘分匹配 - 云端版定时任务
 */

process.chdir(path.join(process.env.HOME || '/root', '.openclaw', 'workspace'));

// 加载云端数据模块
const cloudData = require('./cloud-data');
const match = require('./match');

/**
 * 执行每日匹配
 */
async function runDailyMatching() {
  console.log('[定时任务] 开始执行每日匹配...');
  
  const profiles = await cloudData.getAllProfiles();
  console.log(`[定时任务] 当前用户数: ${profiles.length}`);
  
  const today = new Date().toISOString().split('T')[0];
  const results = [];
  
  for (const profile of profiles) {
    // 检查今日是否已匹配
    if (profile.todayMatchDate === today) {
      console.log(`[定时任务] ${profile.name} 今日已匹配，跳过`);
      continue;
    }
    
    // 获取候选用户
    const candidates = await cloudData.getUnmatchedProfiles(
      profile.userId,
      profile.preferredGender
    );
    
    if (candidates.length === 0) {
      console.log(`[定时任务] ${profile.name} 暂无匹配候选`);
      continue;
    }
    
    // 计算匹配度
    const scores = candidates.map(candidate => {
      const score = match.calculateMatchScore(profile.bazi, candidate.bazi);
      const report = match.generateMatchReport(profile.bazi, candidate.bazi, score);
      return { candidate, score, report };
    });
    
    // 按匹配度排序
    scores.sort((a, b) => b.score - a.score);
    
    const bestMatch = scores[0];
    
    // 阈值 70%
    if (bestMatch.score < 70) {
      console.log(`[定时任务] ${profile.name} 最佳匹配 ${bestMatch.score}% 未达阈值`);
      continue;
    }
    
    // 创建匹配记录
    await cloudData.addMatch({
      userId1: profile.userId,
      userId2: bestMatch.candidate.userId,
      compatibility: bestMatch.score,
      matchDate: today,
      reported: false,
      baziAnalysis: bestMatch.report.interpretation
    });
    
    // 更新匹配状态
    await cloudData.updateMatchStatus(profile.userId);
    await cloudData.updateMatchStatus(bestMatch.candidate.userId);
    
    results.push({
      user: profile.name,
      match: bestMatch.candidate.name,
      score: bestMatch.score
    });
    
    console.log(`[定时任务] ${profile.name} ↔ ${bestMatch.candidate.name} (${bestMatch.score}%)`);
  }
  
  console.log(`[定时任务] 匹配完成，共 ${results.length} 对匹配成功`);
  return results;
}

/**
 * 生成晚8点报告
 */
async function runEveningReports() {
  console.log('[定时任务] 开始生成晚间报告...');
  
  const unreportedMatches = await cloudData.getUnreportedMatches();
  
  for (const matchRecord of unreportedMatches) {
    // 获取对方信息
    const partner = await cloudData.getProfile(matchRecord.userId2);
    const profile = await cloudData.getProfile(matchRecord.userId1);
    
    if (!partner || !profile) {
      console.log(`[定时任务] 用户信息缺失，跳过`);
      continue;
    }
    
    // 生成报告
    const phoneDisplay = partner.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
    
    const report = `🌟 缘分报告 - ${new Date().toLocaleDateString('zh-CN')}

【今日匹配结果】

与 ${partner.name} 的匹配度：${matchRecord.compatibility}%

📱 对方手机：${phoneDisplay}
📍 对方位置：${partner.location}
🖼️ 对方照片：[照片]

💫 八字分析：
年柱：${profile.bazi.year} 🆚 ${partner.bazi.year}
月柱：${profile.bazi.month} 🆚 ${partner.bazi.month}
日柱：${profile.bazi.day} 🆚 ${partner.bazi.day}
时柱：${profile.bazi.hour} 🆚 ${partner.bazi.hour}

${matchRecord.baziAnalysis || '缘分已到！'}

━━━━━━━━━━━━━━━━━
💡 提示：回复「详细匹配」查看完整分析`;

    console.log(`[定时任务] 报告内容:\n${report}`);
    
    // 标记已报告
    await cloudData.markMatchReported(matchRecord.id);
  }
  
  console.log(`[定时任务] 已处理 ${unreportedMatches.length} 份报告`);
  return unreportedMatches;
}

// 导出函数供外部调用
module.exports = {
  runDailyMatching,
  runEveningReports
};

// 命令行接口
const path = require('path');
const args = process.argv.slice(2);
const command = args[0];

if (command === 'match') {
  runDailyMatching()
    .then(() => process.exit(0))
    .catch(e => {
      console.error(e);
      process.exit(1);
    });
} else if (command === 'report') {
  runEveningReports()
    .then(() => process.exit(0))
    .catch(e => {
      console.error(e);
      process.exit(1);
    });
}
