const store = {
  user: null,
  isAdmin: false,
  libraries: [],
  currentLibrary: null,
  mediaList: [],
  directories: [],
  currentPath: '',
  pagination: {
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 0
  },
  tags: [],
  currentTag: null,
  selectedMedia: null,
  searchQuery: '',
  filterType: 'all',
  likedOnly: false,
  flattenMode: false,
  isLoading: false,
  listeners: [],
  
  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  },
  
  notify() {
    this.listeners.forEach(listener => listener(this));
  },
  
  setUser(user, isAdmin = false) {
    this.user = user;
    this.isAdmin = isAdmin;
    this.notify();
  },
  
  setLibraries(libraries) {
    this.libraries = libraries;
    this.notify();
  },
  
  setCurrentLibrary(library) {
    this.currentLibrary = library;
    this.notify();
  },
  
  setMediaList(mediaList, directories, currentPath, pagination) {
    this.mediaList = mediaList;
    this.directories = directories || [];
    this.currentPath = currentPath || '';
    this.pagination = pagination;
    this.notify();
  },
  
  setTags(tags) {
    this.tags = tags;
    this.notify();
  },
  
  setCurrentTag(tag) {
    this.currentTag = tag;
    this.notify();
  },
  
  setSelectedMedia(media) {
    this.selectedMedia = media;
    this.notify();
  },
  
  setSearchQuery(query) {
    this.searchQuery = query;
    this.notify();
  },
  
  setFilterType(type) {
    this.filterType = type;
    this.notify();
  },
  
  setLikedOnly(likedOnly) {
    this.likedOnly = likedOnly;
    this.notify();
  },
  
  setFlattenMode(flatten) {
    this.flattenMode = flatten;
    this.notify();
  },
  
  setCurrentPath(path) {
    this.currentPath = path;
    this.notify();
  },
  
  setLoading(loading) {
    this.isLoading = loading;
    this.notify();
  },
  
  updateMediaItem(mediaId, updates) {
    const index = this.mediaList.findIndex(m => m.id === mediaId);
    if (index !== -1) {
      this.mediaList[index] = { ...this.mediaList[index], ...updates };
      this.notify();
    }
  },
  
  reset() {
    this.user = null;
    this.isAdmin = false;
    this.libraries = [];
    this.currentLibrary = null;
    this.mediaList = [];
    this.directories = [];
    this.currentPath = '';
    this.tags = [];
    this.currentTag = null;
    this.selectedMedia = null;
    this.searchQuery = '';
    this.filterType = 'all';
    this.likedOnly = false;
    this.flattenMode = false;
    this.notify();
  }
};

module.exports = store;