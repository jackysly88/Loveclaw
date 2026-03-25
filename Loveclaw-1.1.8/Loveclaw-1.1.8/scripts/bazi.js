/**
 * 八字缘分匹配 - 八字计算模块
 * 根据出生日期时间计算八字
 */

// 天干
const TIAN_GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];

// 地支
const DI_ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

// 天干对应的五行
const TG_WUXING = {
  '甲': '木', '乙': '木',
  '丙': '火', '丁': '火',
  '戊': '土', '己': '土',
  '庚': '金', '辛': '金',
  '壬': '水', '癸': '水'
};

// 地支对应的五行
const DZ_WUXING = {
  '子': '水', '丑': '土', '寅': '木', '卯': '木',
  '辰': '土', '巳': '火', '午': '火', '未': '土',
  '申': '金', '酉': '金', '戌': '土', '亥': '水'
};

// 地支藏干表
const DZ_CANG_GAN = {
  '子': ['癸'],
  '丑': ['己', '癸', '辛'],
  '寅': ['甲', '丙', '戊'],
  '卯': ['乙'],
  '辰': ['戊', '乙', '癸'],
  '巳': ['丙', '庚', '戊'],
  '午': ['丁', '己'],
  '未': ['己', '丁', '乙'],
  '申': ['庚', '壬', '戊'],
  '酉': ['辛'],
  '戌': ['戊', '辛', '丁'],
  '亥': ['壬', '甲']
};

// 五行
const WUXING = ['木', '火', '土', '金', '水'];

// 五行相生关系
const WUXING_SHENG = {
  '木': '火',
  '火': '土',
  '土': '金',
  '金': '水',
  '水': '木'
};

// 五行相克关系
const WUXING_KE = {
  '木': '土',
  '火': '金',
  '土': '水',
  '金': '木',
  '水': '火'
};

// 节气对应地支（简化）
const JIE_QI_DZ = {
  '立春': '寅', '雨水': '寅',
  '惊蛰': '卯', '春分': '卯',
  '清明': '辰', '谷雨': '辰',
  '立夏': '巳', '小满': '巳',
  '芒种': '午', '夏至': '午',
  '小暑': '未', '大暑': '未',
  '立秋': '申', '处暑': '申',
  '白露': '酉', '秋分': '酉',
  '寒露': '戌', '霜降': '戌',
  '立冬': '亥', '小雪': '亥',
  '大雪': '子', '冬至': '子',
  '小寒': '丑', '大寒': '丑'
};

/**
 * 计算指定年份的天干
 */
function getYearGan(year) {
  // 1984年是甲子年
  const offset = (year - 1984) % 10;
  return offset >= 0 ? TIAN_GAN[offset] : TIAN_GAN[offset + 10];
}

/**
 * 计算指定年份的地支
 */
function getYearZhi(year) {
  // 1984年是子年
  const offset = (year - 1984) % 12;
  return offset >= 0 ? DI_ZHI[offset] : DI_ZHI[offset + 12];
}

/**
 * 计算月干（需要年干配合）
 * @param yearGan 年干
 * @param month 月份（1-12）
 */
function getMonthGan(yearGan, month) {
  // 五虎遁年起月表
  const monthGanIndex = {
    '甲': 2, '乙': 3, '丙': 4, '丁': 5, '戊': 6,
    '己': 7, '庚': 8, '辛': 9, '壬': 10, '癸': 0
  };
  
  const startIndex = monthGanIndex[yearGan];
  const ganIndex = (startIndex + month - 1) % 10;
  return TIAN_GAN[ganIndex];
}

/**
 * 获取月支
 */
function getMonthZhi(month) {
  // 正月为寅
  return DI_ZHI[(month + 1) % 12];
}

/**
 * 计算日干（简化版，需要考虑闰年）
 * 这里使用一个简化算法，实际应该用万年历
 */
function getDayGan(dayOfYear, year) {
  // 假设1月1日为甲子日
  const offset = (dayOfYear - 1) % 10;
  return TIAN_GAN[offset];
}

/**
 * 获取日支
 */
function getDayZhi(dayOfYear, year) {
  const offset = (dayOfYear - 1) % 12;
  return DI_ZHI[offset];
}

/**
 * 计算时干（需要日干配合）
 * @param dayGan 日干
 * @param hour 小时（0-23）
 */
function getHourGan(dayGan, hour) {
  // 五鼠遁日起时表
  const hourGanIndex = {
    '甲': 0, '乙': 1, '丙': 2, '丁': 3, '戊': 4,
    '己': 5, '庚': 6, '辛': 7, '壬': 8, '癸': 9
  };
  
  // 时支索引（子时=23-1点，对应索引0）
  const hourZhiIndex = Math.floor((hour + 1) / 2) % 12;
  
  const startIndex = hourGanIndex[dayGan];
  const ganIndex = (startIndex + hourZhiIndex) % 10;
  return TIAN_GAN[ganIndex];
}

/**
 * 获取时支
 */
function getHourZhi(hour) {
  const hourZhiIndex = Math.floor((hour + 1) / 2) % 12;
  return DI_ZHI[hourZhiIndex];
}

/**
 * 计算八字
 * @param birthDate 出生日期 YYYY-MM-DD
 * @param birthHour 出生小时 0-23
 */
function calculateBazi(birthDate, birthHour) {
  const date = new Date(birthDate);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  
  // 计算年中第几天
  const startOfYear = new Date(year, 0, 0);
  const dayOfYear = Math.floor((date - startOfYear) / (1000 * 60 * 60 * 24));
  
  // 年柱
  const yearGan = getYearGan(year);
  const yearZhi = getYearZhi(year);
  
  // 月柱
  const monthGan = getMonthGan(yearGan, month);
  const monthZhi = getMonthZhi(month);
  
  // 日柱（简化版）
  const dayGan = getDayGan(dayOfYear, year);
  const dayZhi = getDayZhi(dayOfYear, year);
  
  // 时柱
  const hourGan = getHourGan(dayGan, birthHour);
  const hourZhi = getHourZhi(birthHour);
  
  return {
    year: yearGan + yearZhi,
    month: monthGan + monthZhi,
    day: dayGan + dayZhi,
    hour: hourGan + hourZhi,
    yearGan, yearZhi,
    monthGan, monthZhi,
    dayGan, dayZhi,
    hourGan, hourZhi
  };
}

/**
 * 获取五行
 */
function getWuxing(tianGan, diZhi) {
  return {
    tg: TG_WUXING[tianGan],
    dz: DZ_WUXING[diZhi]
  };
}

/**
 * 计算两柱之间的匹配度
 */
function calculateColumnMatch(tg1, dz1, tg2, dz2) {
  const w1 = getWuxing(tg1, dz1);
  const w2 = getWuxing(tg2, dz2);
  
  // 主要看日干的五行
  const dayWuxing1 = w1.tg;
  const dayWuxing2 = w2.tg;
  
  // 相生
  if (WUXING_SHENG[dayWuxing1] === dayWuxing2 || WUXING_SHENG[dayWuxing2] === dayWuxing1) {
    return 100;
  }
  
  // 比和
  if (dayWuxing1 === dayWuxing2) {
    return 80;
  }
  
  // 相克
  if (WUXING_KE[dayWuxing1] === dayWuxing2 || WUXING_KE[dayWuxing2] === dayWuxing1) {
    return 50;
  }
  
  return 40;
}

/**
 * 计算整体匹配度
 */
function calculateMatchScore(bazi1, bazi2) {
  // 年柱 20%
  const yearScore = calculateColumnMatch(
    bazi1.yearGan, bazi1.yearZhi,
    bazi2.yearGan, bazi2.yearZhi
  ) * 0.2;
  
  // 月柱 25%
  const monthScore = calculateColumnMatch(
    bazi1.monthGan, bazi1.monthZhi,
    bazi2.monthGan, bazi2.monthZhi
  ) * 0.25;
  
  // 日柱 30%（最重要）
  const dayScore = calculateColumnMatch(
    bazi1.dayGan, bazi1.dayZhi,
    bazi2.dayGan, bazi2.dayZhi
  ) * 0.3;
  
  // 时柱 25%
  const hourScore = calculateColumnMatch(
    bazi1.hourGan, bazi1.hourZhi,
    bazi2.hourGan, bazi2.hourZhi
  ) * 0.25;
  
  return yearScore + monthScore + dayScore + hourScore;
}

/**
 * 生成匹配报告详情
 */
function generateMatchReport(bazi1, bazi2, score) {
  const yearScore = calculateColumnMatch(
    bazi1.yearGan, bazi1.yearZhi,
    bazi2.yearGan, bazi2.yearZhi
  );
  
  const monthScore = calculateColumnMatch(
    bazi1.monthGan, bazi1.monthZhi,
    bazi2.monthGan, bazi2.monthZhi
  );
  
  const dayScore = calculateColumnMatch(
    bazi1.dayGan, bazi1.dayZhi,
    bazi2.dayGan, bazi2.dayZhi
  );
  
  const hourScore = calculateColumnMatch(
    bazi1.hourGan, bazi1.hourZhi,
    bazi2.hourGan, bazi2.hourZhi
  );
  
  let interpretation = '';
  if (score >= 85) {
    interpretation = '你们的八字非常契合！';
  } else if (score >= 70) {
    interpretation = '你们的八字比较匹配，缘分不错！';
  } else if (score >= 55) {
    interpretation = '你们的八字有些差异，需要多一些磨合。';
  } else {
    interpretation = '你们的八字契合度较低，或许可以做朋友。';
  }
  
  return {
    score: Math.round(score * 10) / 10,
    columns: {
      year: { score: yearScore, bazi1: bazi1.year, bazi2: bazi2.year },
      month: { score: monthScore, bazi1: bazi1.month, bazi2: bazi2.month },
      day: { score: dayScore, bazi1: bazi1.day, bazi2: bazi2.day },
      hour: { score: hourScore, bazi1: bazi1.hour, bazi2: bazi2.hour }
    },
    interpretation
  };
}

module.exports = {
  calculateBazi,
  calculateMatchScore,
  generateMatchReport,
  calculateColumnMatch,
  TIAN_GAN,
  DI_ZHI,
  TG_WUXING,
  DZ_WUXING
};
