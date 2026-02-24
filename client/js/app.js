let currentPage = 'auth';

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
    store.reset();
    AuthPage.render();
  });
  
  window.addEventListener('logout', () => {
    currentPage = 'auth';
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
