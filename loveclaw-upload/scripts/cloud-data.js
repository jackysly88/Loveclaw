/**
 * LoveClaw - 云端数据模块 V3
 * 所有云端操作通过 API 调用中心化服务器
 */

const API_BASE = 'https://loveclaw-cgbnqltfhd.cn-hangzhou.fcapp.run';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// 照片本地缓存目录
const PHOTOS_DIR = path.join(os.homedir(), '.openclaw', 'workspace', 'loveclaw', 'data', 'photos');

/**
 * 发送 HTTP 请求到 API
 */
async function request(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const url = `${API_BASE}${endpoint}`;
  
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    return data;
  } catch (e) {
    console.error('API 请求失败:', e.message);
    return { error: e.message };
  }
}

// ==========================================
// 用户档案 API
// ==========================================

async function saveProfile(profile) {
  return await request('/api/profile', 'POST', profile);
}

async function getProfile(userId) {
  return await request(`/api/profile/${encodeURIComponent(userId)}`);
}

async function getAllProfiles() {
  const result = await request('/api/profiles');
  if (result.success && Array.isArray(result.profiles)) {
    return result.profiles;
  }
  return [];
}

async function deleteProfile(userId) {
  return await request(`/api/profile/${encodeURIComponent(userId)}`, 'DELETE');
}

// ==========================================
// 照片 API
// ==========================================

async function uploadPhoto(userId, photoData) {
  try {
    // 先保存本地
    if (!fs.existsSync(PHOTOS_DIR)) {
      fs.mkdirSync(PHOTOS_DIR, { recursive: true });
    }
    
    const localFileName = `${userId.replace(/[\/\:]/g, '_')}.jpg`;
    const localPath = path.join(PHOTOS_DIR, localFileName);
    const buffer = Buffer.from(photoData, 'base64');
    fs.writeFileSync(localPath, buffer);
    
    // 上传到 API
    const result = await request(`/api/photo/${encodeURIComponent(userId)}`, 'POST', { photoData });
    
    return { 
      localPath, 
      ossUrl: result.success ? result.url : null 
    };
  } catch (e) {
    console.error('照片上传失败:', e.message);
    return { localPath: null, ossUrl: null };
  }
}

async function getPhotoUrl(userId) {
  const result = await request(`/api/photo/${encodeURIComponent(userId)}`);
  return result.success ? result.url : null;
}

function savePhotoLocal(userId, photoData) {
  if (!fs.existsSync(PHOTOS_DIR)) {
    fs.mkdirSync(PHOTOS_DIR, { recursive: true });
  }
  
  const localFileName = `${userId.replace(/[\/\:]/g, '_')}.jpg`;
  const localPath = path.join(PHOTOS_DIR, localFileName);
  const buffer = Buffer.from(photoData, 'base64');
  fs.writeFileSync(localPath, buffer);
  
  return localPath;
}

function getPhotoPath(userId) {
  const localFileName = `${userId.replace(/[\/\:]/g, '_')}.jpg`;
  const localPath = path.join(PHOTOS_DIR, localFileName);
  return fs.existsSync(localPath) ? localPath : null;
}

// ==========================================
// 导出
// ==========================================
module.exports = {
  saveProfile,
  getProfile,
  getAllProfiles,
  deleteProfile,
  uploadPhoto,
  getPhotoUrl,
  savePhotoLocal,
  getPhotoPath
};
