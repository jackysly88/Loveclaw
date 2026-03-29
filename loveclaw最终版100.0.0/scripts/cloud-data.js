/**
 * 云端数据存储 - 阿里云 TableStore + OSS
 * API_BASE: 阿里云函数计算公网触发器
 */

const API_BASE = 'https://loveclaw-cgbnqltfhd.cn-hangzhou.fcapp.run';
const API_TIMEOUT = 15000;
const API_TOKEN = '7c92e07484d4791e7ddf34d7c310e68f12935d60536e36d2dc709f7bc7b74d60';

/**
 * 通用 HTTP 请求
 */
async function apiRequest(path, options = {}) {
  const { method = 'GET', body, headers = {} } = options;
  const resp = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + API_TOKEN,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(API_TIMEOUT),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || `API error: ${resp.status}`);
  }
  return data;
}

/**
 * 获取 OSS 上传凭证（STS Token）
 */
async function getOSSConfigure() {
  const data = await apiRequest('/api/oss');
  return data; // { accessKeyId, accessKeySecret, securityToken, bucket, region, endpoint }
}

/**
 * 获取用户档案
 */
async function getProfile(phone) {
  if (!phone) return null;
  try {
    const data = await apiRequest(`/api/profile/${phone}`);
    // API 返回 success:false（用户不存在）也返回 null
    if (!data.success) return null;
    return data.profile || null;
  } catch (e) {
    // 网络超时或失败时返回 null，避免阻塞注册流程
    if (e.message.includes('404') || e.message.includes('not found') || e.message.includes('timeout') || e.message.includes('network') || e.message.includes('fetch') || e.message.includes('AbortError') || e.message.includes('用户不存在')) {
      return null;
    }
    throw e;
  }
}

/**
 * 保存用户档案
 */
async function saveProfile(profile) {
  // 先删除旧档案（如果存在），避免残留行阻塞注册
  const userId = profile.phone || profile.userId;
  if (userId) {
    try {
      await apiRequest(`/api/profile/${encodeURIComponent(userId)}`, { method: 'DELETE' });
    } catch (e) {
      // 删除失败也继续（行可能不存在）
    }
  }
  const data = await apiRequest('/api/register', {
    method: 'POST',
    body: profile,
  });
  return data;
}

/**
 * 更新用户档案中的 matchedWith
 */
async function updateProfile(phone, updates) {
  // 先获取现有档案
  const existing = await getProfile(phone);
  if (!existing) throw new Error('Profile not found');
  const updated = { ...existing, ...updates };
  const data = await apiRequest('/api/register', {
    method: 'POST',
    body: updated,
  });
  return data;
}

async function deleteProfile(phone) {
  try {
    await apiRequest('/api/profile/' + phone, { method: 'DELETE' });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 获取所有已报名的用户档案
 */
async function getAllProfiles() {
  try {
    const data = await apiRequest('/api/profiles');
    const profiles = data.profiles || [];
    // 合并八字分字段为 bazi 对象（含 Gan/Zhi 分字段，供 calculateMatchScore 使用）
    return profiles.map(p => ({
      ...p,
      bazi: {
        year: p.baziYear || '',
        month: p.baziMonth || '',
        day: p.baziDay || '',
        hour: p.baziHour || '',
        yearGan: p.baziYearGan || '',
        yearZhi: p.baziYearZhi || '',
        monthGan: p.baziMonthGan || '',
        monthZhi: p.baziMonthZhi || '',
        dayGan: p.baziDayGan || '',
        dayZhi: p.baziDayZhi || '',
        hourGan: p.baziHourGan || '',
        hourZhi: p.baziHourZhi || '',
      }
    }));
  } catch (e) {
    console.error('[getAllProfiles]', e.message);
    return [];
  }
}

/**
 * 获取所有未匹配的报名用户（用于匹配算法）
 */
async function getAllUnmatchedProfiles(excludePhone) {
  // TableStore 没有直接列出所有行的 API，通过 match 接口间接获取
  // 调用 /api/match 会返回所有未匹配用户
  try {
    const data = await apiRequest('/api/match', {
      method: 'POST',
      body: { phone: excludePhone, skipNotify: true },
    });
    return data.profiles || [];
  } catch (e) {
    return [];
  }
}

/**
 * 获取指定用户的匹配历史
 */
async function getMatchHistory(phone) {
  const profile = await getProfile(phone);
  if (!profile) return [];
  return profile.matchedWithHistory || [];
}

/**
 * 获取最近匹配记录（用于报告）
 */
async function getRecentMatches() {
  try {
    const data = await apiRequest('/api/report');
    return data.matches || [];
  } catch (e) {
    console.error('getRecentMatches error:', e.message);
    return [];
  }
}

/**
 * 上传照片（委托云函数处理 OSS，skill 侧不直连 OSS）
 */
async function uploadPhoto(phone, photoData) {
  let body;
  if (typeof photoData === 'string' && (photoData.startsWith('http://') || photoData.startsWith('https://'))) {
    // 飞书等渠道传来的图片 URL，让云函数去 fetch 后上传 OSS
    body = { userId: phone, photoUrl: photoData };
  } else if (typeof photoData === 'string' && photoData.startsWith('data:')) {
    body = { userId: phone, photoData: photoData.split(',')[1] };
  } else if (typeof photoData === 'string') {
    body = { userId: phone, photoData };
  } else {
    body = { userId: phone, photoData: photoData.toString('base64') };
  }

  const data = await apiRequest('/api/photo', { method: 'POST', body });
  if (!data.success) throw new Error(data.error || '照片上传失败');
  return data.url;
}

/**
 * 获取当日匹配结果（用于晚间报告）
 */
async function getTodayMatches() {
  try {
    const data = await apiRequest('/api/report');
    return {
      matches: data.matches || [],
      noMatchUsers: data.noMatchUsers || [],
    };
  } catch (e) {
    console.error('getTodayMatches error:', e.message);
    return { matches: [], noMatchUsers: [] };
  }
}


/**
 * 获取未匹配的候选用户（按偏好性别筛选）
 */
async function getUnmatchedProfiles(excludePhone, preferredGender) {
  const all = await getAllProfiles();
  const today = new Date().toISOString().split('T')[0];
  return all.filter(p => {
    if (p.userId === excludePhone) return false;
    if (p.todayMatchDate === today) return false;
    if (p.gender !== preferredGender) return false;
    return true;
  });
}

/**
 * 更新用户匹配状态（今日已匹配）
 */
async function updateMatchStatus(phone) {
  const today = new Date().toISOString().split('T')[0];
  return updateProfile(phone, { todayMatchDate: today, todayMatchDone: '1' });
}

/**
 * 获取今日未推送的匹配记录
 */
async function getUnreportedMatches() {
  try {
    const data = await apiRequest('/api/report');
    return (data.matches || []).filter(m => !m.reported);
  } catch (e) {
    return [];
  }
}

/**
 * 执行匹配（调用云端 API）
 */
async function runMatch(phone) {
  try {
    const data = await apiRequest('/api/match', {
      method: 'POST',
      body: { phone },
    });
    if (data.matched && data.partner) {
      return { matched: true, partner: data.partner, compatibility: data.compatibility };
    }
    return { matched: false };
  } catch (e) {
    console.error('[runMatch]', e.message);
    return { matched: false };
  }
}

/**
 * 保存匹配结果（skill 侧计算完调用）
 */
async function saveMatch(phone, matchedWith, histArr) {
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().split('T')[0];
  try {
    await apiRequest('/api/match/save', {
      method: 'POST',
      body: { phone, matchedWith, todayMatchDate: today, matchedWithHistory: histArr },
    });
    return { success: true };
  } catch (e) {
    console.error('[saveMatch]', phone, e.message);
    return { success: false, error: e.message };
  }
}

module.exports = {
  getProfile,
  saveProfile,
  updateProfile,
  deleteProfile,
  getAllProfiles,
  getAllUnmatchedProfiles,
  getUnmatchedProfiles,
  updateMatchStatus,
  getUnreportedMatches,
  runMatch,
  saveMatch,
  getMatchHistory,
  getRecentMatches,
  getTodayMatches,
  getOSSConfigure,
  uploadPhoto,
  apiRequest,
};

/**
 * 执行匹配（调用云端 API）
 */
async function runMatch(phone) {
  try {
    const data = await apiRequest('/api/match', {
      method: 'POST',
      body: { phone },
    });
    if (data.matched && data.partner) {
      return { matched: true, partner: data.partner, compatibility: data.compatibility };
    }
    return { matched: false };
  } catch (e) {
    console.error('[runMatch]', e.message);
    return { matched: false };
  }
}
