const routes = {
  auth: 'auth',
  libraries: 'libraries',
  browser: 'browser'
};

let currentRoute = null;
let currentParams = {};

function navigate(routeName, params = {}) {
  currentRoute = routeName;
  currentParams = params;
  
  const url = new URL(window.location.href);
  
  if (routeName === routes.browser && params.libraryId) {
    url.searchParams.set('libraryId', params.libraryId);
    if (params.path) {
      url.searchParams.set('path', params.path);
    } else {
      url.searchParams.delete('path');
    }
  } else if (routeName === routes.libraries) {
    url.search = '';
  } else if (routeName === routes.auth) {
    url.search = '';
  }
  
  window.history.pushState({}, '', url);
  
  window.dispatchEvent(new CustomEvent('route-change', {
    detail: { route: routeName, params }
  }));
}

function back() {
  window.history.back();
}

function parseUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const libraryId = urlParams.get('libraryId');
  const path = urlParams.get('path');
  
  if (libraryId) {
    return {
      route: routes.browser,
      params: { libraryId: parseInt(libraryId), path: path || '' }
    };
  }
  
  if (store.user) {
    return { route: routes.libraries, params: {} };
  }
  
  return { route: routes.auth, params: {} };
}

function getCurrentRoute() {
  return currentRoute;
}

function getCurrentParams() {
  return { ...currentParams };
}

function init() {
  const { route, params } = parseUrl();
  currentRoute = route;
  currentParams = params;
  
  window.addEventListener('popstate', () => {
    const { route, params } = parseUrl();
    currentRoute = route;
    currentParams = params;
    
    window.dispatchEvent(new CustomEvent('route-change', {
      detail: { route, params }
    }));
  });
}