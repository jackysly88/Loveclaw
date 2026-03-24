/**
 * LoveClaw - 云端数据模块 V4
 * 支持同步/异步两种接口
 * 写操作：先存本地，再同步到云端
 * 读操作：优先读本地缓存
 */

const API_BASE = 'https://loveclaw-cgbnqltfhd.cn-hangzhou.fcapp.run';
const fs = require('fs');
const path = require('path');
const os = require('os');

// 本地缓存目录
const CACHE_DIR = path.join(os.homedir(), '.openclaw', 'workspace', 'loveclaw', 'data');
const PROFILES_CACHE = path.join(CACHE_DIR, 'profiles.json');
const PHOTOS_DIR = path.join(CACHE_DIR, 'photos');

// 确保目录存在
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });

/**
 * 发送 HTTP 请求到 API（异步）
 */
async function request(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) options.body = JSON.stringify(body);
  
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    return await response.json();
  } catch (e) {
    console.error('API 请求失败:', e.message);
    return { error: e.message };
  }
}

// ==========================================
// 同步接口（供 handler.js 使用）
// ==========================================

// 读取本地缓存
function loadProfilesSync() {
  try {
    if (!fs.existsSync(PROFILES_CACHE)) return [];
    const data = fs.readFileSync(PROFILES_CACHE, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

// 保存本地缓存
function saveProfilesSync(profiles) {
  try {
    fs.writeFileSync(PROFILES_CACHE, JSON.stringify(profiles, null, 2));
  } catch (e) {
    console.error('保存本地缓存失败:', e.message);
  }
}

// 同步获取档案
function getProfile(userId) {
  const profiles = loadProfilesSync();
  return profiles.find(p => p.userId === userId) || null;
}

// 同步保存档案
function saveProfile(profile) {
  const profiles = loadProfilesSync();
  const index = profiles.findIndex(p => p.userId === profile.userId);
  if (index >= 0) {
    profiles[index] = profile;
  } else {
    profiles.push(profile);
  }
  saveProfilesSync(profiles);
  // 异步同步到云端
  request('/api/profile', 'POST', profile).catch(e => console.error('云端同步失败:', e.message));
}

// 同步删除档案
function deleteProfile(userId) {
  let profiles = loadProfilesSync();
  profiles = profiles.filter(p => p.userId !== userId);
  saveProfilesSync(profiles);
  // 异步同步到云端
  request(`/api/profile/${encodeURIComponent(userId)}`, 'DELETE').catch(e => console.error('云端删除失败:', e.message));
}

// 同步获取所有档案
function getAllProfiles() {
  return loadProfilesSync();
}

// 同步获取今日匹配
function getUserTodayMatch(userId) {
  const profiles = loadProfilesSync();
  const profile = profiles.find(p => p.userId === userId);
  if (!profile || !profile.todayMatchDone) return null;
  return {
    userId1: userId,
    userId2: profile.matchedWith,
    compatibility: profile.matchScore || 0
  };
}

// 同步保存匹配
function addMatch(matchRecord) {
  // 更新双方的匹配状态
  const profiles = loadProfilesSync();
  const user1 = profiles.find(p => p.userId === matchRecord.userId1);
  const user2 = profiles.find(p => p.userId === matchRecord.userId2);
  
  if (user1) {
    user1.todayMatchDone = true;
    user1.todayMatchDate = matchRecord.matchDate;
    user1.matchedWith = matchRecord.userId2;
    user1.matchScore = matchRecord.compatibility;
  }
  if (user2) {
    user2.todayMatchDone = true;
    user2.todayMatchDate = matchRecord.matchDate;
    user2.matchedWith = matchRecord.userId1;
    user2.matchScore = matchRecord.compatibility;
  }
  
  saveProfilesSync(profiles);
  // 异步同步到云端
  request('/api/match', 'POST', matchRecord).catch(e => console.error('云端匹配同步失败:', e.message));
}

// 同步保存照片
function savePhotoLocal(userId, photoData) {
  const photoPath = path.join(PHOTOS_DIR, `${userId.replace(/[\/\:]/g, '_')}.jpg`);
  try {
    const buffer = Buffer.from(photoData, 'base64');
    fs.writeFileSync(photoPath, buffer);
    return photoPath;
  } catch (e) {
    console.error('保存照片失败:', e.message);
    return null;
  }
}

// 同步获取照片路径
function getPhotoPath(userId) {
  const photoPath = path.join(PHOTOS_DIR, `${userId.replace(/[\/\:]/g, '_')}.jpg`);
  return fs.existsSync(photoPath) ? photoPath : null;
}

// 同步上传照片到云端
async function uploadPhoto(userId, photoData) {
  const localPath = savePhotoLocal(userId, photoData);
  const result = await request(`/api/photo/${encodeURIComponent(userId)}`, 'POST', { photoData });
  return { localPath, ossUrl: result.success ? result.url : null };
}

// 同步获取照片URL
async function getPhotoUrl(userId) {
  const result = await request(`/api/photo/${encodeURIComponent(userId)}`);
  return result.success ? result.url : null;
}

module.exports = {
  // 同步接口（主要供 handler.js 使用）
  getProfile,
  saveProfile,
  deleteProfile,
  getAllProfiles,
  getUserTodayMatch,
  addMatch,
  savePhotoLocal,
  getPhotoPath,
  // 异步接口（可选）
  uploadPhoto,
  getPhotoUrl,
  // 调试用
  loadProfilesSync
};
