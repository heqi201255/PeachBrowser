let currentPage = null;
let currentPageInstance = null;

const ScanProgressManager = {
  activeProgress: new Map(),
  interval: null,
  
  start() {
    if (this.interval) return;
    this.interval = setInterval(() => this.poll(), 1000);
    this.poll();
  },
  
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
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
      'scanning': t('scan.scanning'),
      'processing': t('scan.processing'),
      'thumbnails': t('scan.thumbnails')
    }[p.stage] || t('scan.processingStage');
    
    const escapeHtml = (text) => {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    };
    
    bar.innerHTML = `
      <div class="scan-progress-content">
        <span class="scan-progress-library">${escapeHtml(p.libraryName)}</span>
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
  if (!token) return false;
  
  try {
    const user = await api.getCurrentUser();
    store.setUser({ id: user.id, username: user.username }, user.is_admin);
    return true;
  } catch (err) {
    api.setToken(null);
    return false;
  }
}

async function initApp() {
  const isAuthed = await checkAuth();
  
  router.init();
  
  if (isAuthed) {
    ScanProgressManager.start();
    const { route, params } = router.parseUrl();
    
    if (route === router.routes.browser) {
      await navigateToBrowser(params.libraryId, params.path);
    } else {
      await navigateToLibraries();
    }
  } else {
    navigateToAuth();
  }
  
  setupEventListeners();
}

function setupEventListeners() {
  window.addEventListener('route-change', async (e) => {
    const { route, params } = e.detail;
    
    if (route === router.routes.auth) {
      navigateToAuth();
    } else if (route === router.routes.libraries) {
      await navigateToLibraries();
    } else if (route === router.routes.browser) {
      await navigateToBrowser(params.libraryId, params.path);
    }
  });
  
  window.addEventListener('auth-success', async () => {
    ScanProgressManager.start();
    await navigateToLibraries();
  });
  
  window.addEventListener('auth-expired', () => {
    ScanProgressManager.stop();
    store.reset();
    navigateToAuth();
  });
  
  window.addEventListener('logout', () => {
    ScanProgressManager.stop();
    navigateToAuth();
  });
  
  window.addEventListener('navigate-libraries', async () => {
    router.navigate(router.routes.libraries);
  });
  
  window.addEventListener('navigate-library', async (e) => {
    const library = e.detail;
    router.navigate(router.routes.browser, { libraryId: library.id, path: '' });
  });
  
  window.addEventListener('language-change', () => {
    if (currentPageInstance && currentPageInstance.update) {
      currentPageInstance.update();
      currentPageInstance.bindEvents();
    }
  });
}

function navigateToAuth() {
  currentPage = 'auth';
  if (currentPageInstance) currentPageInstance.unmount();
  currentPageInstance = new AuthPage({});
  currentPageInstance.mount(document.getElementById('app'));
}

async function navigateToLibraries() {
  currentPage = 'libraries';
  if (currentPageInstance) currentPageInstance.unmount();
  currentPageInstance = new LibrariesPage({});
  currentPageInstance.mount(document.getElementById('app'));
  await currentPageInstance.loadLibraries();
}

async function navigateToBrowser(libraryId, path = '') {
  currentPage = 'browser';
  
  // Reset store state for new library navigation
  store.setMediaList([], [], '', { page: 1, pageSize: 50, total: 0, totalPages: 0 });
  store.setCurrentPath(path);
  store.setCurrentTag(null);
  store.setSearchQuery('');
  store.setFilterType('all');
  store.setLikedOnly(false);
  store.setFlattenMode(false);
  
  if (currentPageInstance) currentPageInstance.unmount();
  currentPageInstance = new BrowserPage({});
  currentPageInstance.mount(document.getElementById('app'));
  await currentPageInstance.loadMedia(libraryId, { path });
}

document.addEventListener('DOMContentLoaded', initApp);

window.showToast = showToast;