const API_BASE = '/api';

let authToken = localStorage.getItem('token');

function setToken(token) {
  authToken = token;
  if (token) {
    localStorage.setItem('token', token);
  } else {
    localStorage.removeItem('token');
  }
}

function getToken() {
  return authToken;
}

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  
  const response = await fetch(url, {
    ...options,
    headers
  });
  
  if (response.status === 401) {
    setToken(null);
    window.dispatchEvent(new CustomEvent('auth-expired'));
    throw new Error('Unauthorized');
  }
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Request failed');
  }
  
  if (response.status === 204) {
    return null;
  }
  
  return response.json();
}

const api = {
  setToken,
  getToken,
  
  async register(username, password) {
    const data = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    setToken(data.token);
    return data;
  },
  
  async login(username, password) {
    const data = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    setToken(data.token);
    return data;
  },
  
  async verifyAuth() {
    return request('/auth/verify');
  },
  
  async getCurrentUser() {
    return request('/auth/me');
  },
  
  async getLibraries() {
    return request('/libraries');
  },
  
  async createLibrary(name, folderPath) {
    return request('/libraries', {
      method: 'POST',
      body: JSON.stringify({ name, folderPath })
    });
  },
  
  async deleteLibrary(id) {
    return request(`/libraries/${id}`, { method: 'DELETE' });
  },
  
  async getMedia(libraryId, params = {}) {
    const query = new URLSearchParams(params).toString();
    return request(`/libraries/${libraryId}/media?${query}`);
  },
  
  async getMediaDetail(mediaId) {
    return request(`/media/${mediaId}`);
  },
  
  async deleteMedia(mediaId) {
    return request(`/media/${mediaId}`, { method: 'DELETE' });
  },
  
  async updatePlayProgress(mediaId, position, completed = false) {
    return request(`/media/${mediaId}/play`, {
      method: 'POST',
      body: JSON.stringify({ position, completed })
    });
  },
  
  async addTag(mediaId, tagName) {
    return request(`/media/${mediaId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tagName })
    });
  },
  
  async removeTag(mediaId, tagId) {
    return request(`/media/${mediaId}/tags/${tagId}`, { method: 'DELETE' });
  },
  
  async getTags(libraryId) {
    if (libraryId) {
      return request(`/tags?libraryId=${libraryId}`);
    }
    return request('/tags');
  },
  
  async uploadFile(libraryId, file, targetDir = '') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('targetDir', targetDir);
    
    const response = await fetch(`${API_BASE}/libraries/${libraryId}/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: formData
    });
    
    if (!response.ok) {
      throw new Error('Upload failed');
    }
    
    return response.json();
  },
  
  async getThumbnailStatus() {
    return request('/thumbnail-status');
  },
  
  getFileUrl(libraryId, relativePath) {
    return `${API_BASE}/libraries/${libraryId}/files/${encodeURIComponent(relativePath)}?token=${authToken}`;
  },
  
  getThumbnailUrl(libraryId, relativePath) {
    return `${API_BASE}/libraries/${libraryId}/thumbnails/${encodeURIComponent(relativePath)}?token=${authToken}`;
  },
  
  async changePassword(oldPassword, newPassword) {
    return request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword })
    });
  },
  
  async getDirectoryStructure(libraryId, parentPath = '') {
    const query = parentPath ? `?path=${encodeURIComponent(parentPath)}` : '';
    return request(`/libraries/${libraryId}/directories${query}`);
  },
  
  async getRating(mediaId) {
    return request(`/media/${mediaId}/rating`);
  },
  
  async setRating(mediaId, rating) {
    return request(`/media/${mediaId}/rating`, {
      method: 'POST',
      body: JSON.stringify({ rating })
    });
  },
  
  async getUsers() {
    return request('/admin/users');
  },
  
  async updateUserLibraries(userId, libraryIds) {
    return request(`/admin/users/${userId}/libraries`, {
      method: 'POST',
      body: JSON.stringify({ libraryIds })
    });
  },
  
  async syncLibrary(libraryId) {
    return request(`/libraries/${libraryId}/sync`, { method: 'POST' });
  },
  
  async getScanProgress() {
    return request('/scan-progress');
  },
  
  deleteUser(userId) {
    return request(`/admin/users/${userId}`, { method: 'DELETE' });
  },
  
  getPreviewFrameUrl(mediaId, timeSeconds) {
    return `${API_BASE}/media/${mediaId}/preview?time=${timeSeconds}&token=${authToken}`;
  },
  
  async getLikeStatus(mediaId) {
    return request(`/media/${mediaId}/like`);
  },
  
  async toggleLike(mediaId) {
    return request(`/media/${mediaId}/like`, { method: 'POST' });
  }
};
