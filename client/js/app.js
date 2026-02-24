let currentPage = 'auth';
let progressPollInterval = null;

const ScanProgressManager = {
  activeProgress: new Map(),
  
  start() {
    if (progressPollInterval) return;
    progressPollInterval = setInterval(() => this.poll(), 1000);
    this.poll();
  },
  
  stop() {
    if (progressPollInterval) {
      clearInterval(progressPollInterval);
      progressPollInterval = null;
    }
    this.hideBar();
  },
  
  async poll() {
    try {
      const data = await api.getScanProgress();
      if (data.active && data.active.length > 0) {
        data.active.forEach(p => this.activeProgress.set(p.libraryId, p));
        this.updateBar();
      } else {
        this.activeProgress.clear();
        this.hideBar();
      }
    } catch (err) {
      console.error('Failed to poll scan progress:', err);
    }
  },
  
  updateBar() {
    let bar = document.getElementById('scanProgressBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'scanProgressBar';
      bar.className = 'scan-progress-bar';
      document.body.insertBefore(bar, document.body.firstChild);
    }
    
    const progressList = Array.from(this.activeProgress.values());
    if (progressList.length === 0) {
      this.hideBar();
      return;
    }
    
    const p = progressList[0];
    const percent = p.total > 0 ? Math.round((p.current / p.total) * 100) : 0;
    const stageText = {
      'scanning': '扫描文件中',
      'processing': '处理文件中',
      'thumbnails': '生成预览图中'
    }[p.stage] || '处理中';
    
    bar.innerHTML = `
      <div class="scan-progress-content">
        <span class="scan-progress-library">${this.escapeHtml(p.libraryName)}</span>
        <span class="scan-progress-stage">${stageText}</span>
        <span class="scan-progress-count">${p.current}/${p.total || '?'}</span>
      </div>
      <div class="scan-progress-track">
        <div class="scan-progress-fill" style="width: ${percent}%"></div>
      </div>
    `;
    bar.classList.add('show');
  },
  
  hideBar() {
    const bar = document.getElementById('scanProgressBar');
    if (bar) {
      bar.classList.remove('show');
    }
  },
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast:not(.modal .toast)');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.remove(), 3000);
}

async function checkAuth() {
  const token = localStorage.getItem('token');
  if (!token) {
    return false;
  }
  
  try {
    // Get current user info (this will fail 401 if user doesn't exist)
    const user = await api.getCurrentUser();
    store.setUser({ id: user.id, username: user.username }, user.is_admin);
    return true;
  } catch (err) {
    // User doesn't exist or token invalid - clear token
    api.setToken(null);
    return false;
  }
}

async function initApp() {
  const isAuthed = await checkAuth();
  
  if (isAuthed) {
    ScanProgressManager.start();
    const urlParams = new URLSearchParams(window.location.search);
    const libraryId = urlParams.get('libraryId');
    const path = urlParams.get('path');
    
    if (libraryId) {
      currentPage = 'browser';
      await BrowserPage.init(parseInt(libraryId), { path: path || '' });
      BrowserPage.render();
    } else {
      currentPage = 'libraries';
      await LibrariesPage.init();
      LibrariesPage.render();
    }
  } else {
    currentPage = 'auth';
    AuthPage.render();
  }
  
  setupEventListeners();
}

function updateUrl(params = {}) {
  const url = new URL(window.location.href);
  if (params.libraryId !== undefined) {
    if (params.libraryId) {
      url.searchParams.set('libraryId', params.libraryId);
    } else {
      url.searchParams.delete('libraryId');
    }
  }
  if (params.path !== undefined) {
    if (params.path) {
      url.searchParams.set('path', params.path);
    } else {
      url.searchParams.delete('path');
    }
  }
  if (Object.keys(params).length === 0) {
    url.search = '';
  }
  window.history.pushState({}, '', url);
}

function setupEventListeners() {
  window.addEventListener('popstate', async (e) => {
    const urlParams = new URLSearchParams(window.location.search);
    const libraryId = urlParams.get('libraryId');
    const path = urlParams.get('path') || '';
    
    if (libraryId) {
      currentPage = 'browser';
      store.setCurrentPath(path);
      store.setCurrentLibrary(store.libraries.find((l) => l.id === parseInt(libraryId)) || null);
      await BrowserPage.init(parseInt(libraryId), { path: path, skipUrlUpdate: true });
      BrowserPage.render();
    } else {
      currentPage = 'libraries';
      store.setCurrentLibrary(null);
      store.setSelectedMedia(null);
      store.setCurrentPath('');
      await LibrariesPage.init();
      LibrariesPage.render();
    }
  });

  window.addEventListener('auth-success', async () => {
    currentPage = 'libraries';
    updateUrl({});
    await LibrariesPage.init();
    LibrariesPage.render();
  });
  
  window.addEventListener('auth-expired', () => {
    currentPage = 'auth';
    ScanProgressManager.stop();
    store.reset();
    AuthPage.render();
  });
  
  window.addEventListener('logout', () => {
    currentPage = 'auth';
    ScanProgressManager.stop();
    updateUrl({});
    AuthPage.render();
  });
  
  window.addEventListener('navigate-libraries', async () => {
    currentPage = 'libraries';
    store.setCurrentLibrary(null);
    store.setSelectedMedia(null);
    store.setCurrentPath('');
    updateUrl({});
    await LibrariesPage.init();
    LibrariesPage.render();
  });
  
  window.addEventListener('navigate-library', async (e) => {
    currentPage = 'browser';
    await BrowserPage.init(e.detail.id, { path: '' });
    BrowserPage.render();
  });
  
  document.addEventListener('click', (e) => {
    if (e.target.closest('.player-overlay') && e.target.closest('#closePlayer')) {
      PlayerModal.close();
    }
  });
}

document.addEventListener('DOMContentLoaded', initApp);

window.showToast = showToast;
window.updateUrl = updateUrl;
