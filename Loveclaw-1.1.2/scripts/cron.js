/**
 * LoveClaw - 定时任务脚本
 * 每日匹配 & 晚8点报告
 */

const path = require('path');
const os = require('os');

// 设置工作目录
const SKILL_DIR = path.join(os.homedir(), '.openclaw', 'workspace', 'skills', 'loveclaw');
process.chdir(SKILL_DIR);

// 加载模块
const data = require('./data');
const match = require('./match');

/**
 * 执行每日匹配
 */
function runDailyMatching() {
  console.log('[定时任务] 开始执行每日匹配...');
  
  // 重置所有用户的每日匹配状态
  match.resetDailyStatus();
  
  // 执行匹配
  const results = match.runAllDailyMatches();
  
  console.log(`[定时任务] 匹配完成，${results.matched.length} 对 mutual match 成功`);
  console.log(`[定时任务] ${results.noMatch.length} 位用户今日无匹配`);
  
  return results;
}

/**
 * 生成晚8点报告
 */
async function runEveningReports() {
  console.log('[定时任务] 开始生成晚间报告...');
  
  const reports = [];
  
  // 1. 处理有匹配的用户
  const unreportedMatches = data.getUnreportedMatches();
  
  for (const matchRecord of unreportedMatches) {
    const partnerId = matchRecord.userId2;
    const partner = data.getProfile(partnerId);
    
    if (!partner) continue;
    
    const profile = data.getProfile(matchRecord.userId1);
    if (!profile) continue;
    
    const message = match.formatMatchReport(
      {
        name: partner.name,
        phone: partner.phone,
        city: partner.city,
        photo: partner.photo
      },
      matchRecord.compatibility,
      '你们的八字非常契合！'
    );
    
    // 标记已报告
    data.markMatchReported(matchRecord.id);
    
    reports.push({
      userId: matchRecord.userId1,
      channel: profile.channel || 'webchat',
      target: profile.notificationTarget || profile.userId,
      hasMatch: true,
      message
    });
  }
  
  // 2. 处理无匹配的用户 - 发送命运消息
  const noMatchUserIds = match.getTodayNoMatchUserIds();
  
  for (const userId of noMatchUserIds) {
    const profile = data.getProfile(userId);
    if (!profile) continue;
    
    // 检查用户今日是否已有报告
    const todayMatch = data.getUserTodayMatch(userId);
    if (todayMatch && todayMatch.reported) continue;
    
    reports.push({
      userId,
      channel: profile.channel || 'webchat',
      target: profile.notificationTarget || profile.userId,
      hasMatch: false,
      message: '🌙 命运的齿轮继续转动，请期待月老明日的光临 ✨'
    });
  }
  
  console.log(`[定时任务] 生成 ${reports.filter(r => r.hasMatch).length} 份匹配报告`);
  console.log(`[定时任务] 发送 ${reports.filter(r => !r.hasMatch).length} 份无匹配通知`);
  
  // 输出 JSON 格式的报告供 agent 发送
  console.log('【REPORTS_JSON】' + JSON.stringify(reports) + '【REPORTS_JSON_END】');
  
  return reports;
}

/**
 * 发送无匹配通知（单独调用）
 */
function sendNoMatchNotifications() {
  console.log('[定时任务] 发送无匹配通知...');
  
  const noMatchUserIds = match.getTodayNoMatchUserIds();
  
  for (const userId of noMatchUserIds) {
    const profile = data.getProfile(userId);
    if (!profile) continue;
    
    const message = `🌙 今日缘分未到...\n\n`;
    
    console.log(`[通知] 发送给 ${profile.name}: 命运的齿轮继续转动，请期待月老明日的光临`);
  }
  
  return noMatchUserIds;
}

// 命令行接口
const args = process.argv.slice(2);
const command = args[0];

if (command === 'match') {
  runDailyMatching();
} else if (command === 'report') {
  runEveningReports().then(reports => {
    console.log('报告生成完成');
    process.exit(0);
  });
} else if (command === 'nomatch') {
  sendNoMatchNotifications();
} else {
  console.log('用法: node cron.js [match|report|nomatch]');
  process.exit(1);
}

module.exports = { runDailyMatching, runEveningReports, sendNoMatchNotifications };
