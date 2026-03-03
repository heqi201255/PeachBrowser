class BrowserPage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hoverVideo: null,
      hoverTimeout: null,
      expandedDirs: new Set(),
      directoryTree: [],
      previewVolume: 0.5,
      savedTreeScrollTop: 0,
      lazyObserver: null,
      showSettingsModal: false
    };
    this.loadingLibraryId = null;
  }

  render() {
    this._cleanup();
    
    const {
      mediaList,
      directories,
      currentPath,
      pagination,
      currentLibrary,
      tags,
      currentTag,
      searchQuery,
      filterType,
      selectedMedia
    } = store;
    
    const showBackButton = currentPath !== '';
    const mobile = isMobile();
    
    return `
      <div class="app-layout">
        <aside class="sidebar">
          <div class="sidebar-header">
            <h2 class="logo-btn" style="cursor:pointer;display:flex;align-items:center;gap:8px;">
              <img src="assets/logo.png" alt="Logo" style="width:24px;height:24px;">
              PeachBrowser
            </h2>
          </div>
          
          <div class="sidebar-section">
            <h3>${t('navigation.filter')}</h3>
            <ul class="sidebar-nav">
              <li class="${filterType === 'all' && !store.likedOnly ? 'active' : ''}" data-type="all">
                <span>📁</span> ${t('navigation.all')}
              </li>
              <li class="${store.likedOnly ? 'active' : ''}" data-filter="liked">
                <span>♥</span> ${t('navigation.liked')}
              </li>
              <li class="${filterType === 'video' && !store.likedOnly ? 'active' : ''}" data-type="video">
                <span>🎬</span> ${t('navigation.videos')}
              </li>
              <li class="${filterType === 'image' && !store.likedOnly ? 'active' : ''}" data-type="image">
                <span>🖼</span> ${t('navigation.images')}
              </li>
              <li class="${filterType === 'audio' && !store.likedOnly ? 'active' : ''}" data-type="audio">
                <span>🎵</span> ${t('navigation.audios')}
              </li>
            </ul>
          </div>
          
          <div class="sidebar-section">
            <h3>${t('navigation.directories')}</h3>
            <ul class="sidebar-nav directory-tree">
              ${this._renderDirectoryTree(this.state.directoryTree, '')}
            </ul>
          </div>
          
          <div class="sidebar-section">
            <h3>${t('navigation.tags')}</h3>
            <ul class="sidebar-nav">
              ${tags.map(tag => `
                <li class="${currentTag === tag.name ? 'active' : ''}" data-tag="${escapeHtml(tag.name)}">
                  <span style="color:#3498db">#</span> ${escapeHtml(tag.name)}
                  <span class="count">${tag.media_count}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        </aside>
        
        <main class="main-content ${mobile ? '' : 'has-detail-panel'}">
          <header class="header">
            <div style="display:flex;align-items:center;gap:12px;">
              ${showBackButton ? `<button class="btn btn-secondary btn-small back-btn">← ${t('confirm.previous')}</button>` : ''}
              <div>
                <h1>${currentLibrary ? escapeHtml(currentLibrary.name) : t('navigation.libraries')}</h1>
                ${currentPath ? `<div style="font-size:12px;color:var(--text-secondary);">${escapeHtml(currentPath)}</div>` : ''}
              </div>
            </div>
              <div class="header-actions">
                <div class="volume-control">
                  <div class="volume-slider-container">
                    <input type="range" class="volume-slider" min="0" max="100" value="${this.state.previewVolume * 100}">
                  </div>
                  <button class="volume-btn" title="🔊">🔊</button>
                </div>
                <label class="flatten-mode-label">
                  <input type="checkbox" class="flatten-mode-checkbox" ${store.flattenMode ? 'checked' : ''}>
                  <span>${t('header.flattenMode')}</span>
                </label>
                <button class="btn btn-secondary btn-small sync-btn">${t('header.sync')}</button>
                <div class="search-box">
                  <input type="text" class="search-input" placeholder="${t('header.searchPlaceholder')}" value="${escapeHtml(searchQuery)}">
                </div>
                <button class="btn btn-secondary btn-small settings-btn" title="${t('header.settings')}">⚙️</button>
                <div class="user-menu">
                  <button class="user-menu-btn">
                    <span>👤</span>
                    <span>${escapeHtml(store.user?.username || 'User')}</span>
                  </button>
                  <div class="user-menu-dropdown">
                    <button class="logout-btn">${t('user.logout')}</button>
                  </div>
                </div>
              </div>
          </header>
          
          <div class="content-wrapper">
            <div class="main-content-area">
              <div class="content" id="dropZone">
                ${directories.length === 0 && mediaList.length === 0 ? `
                  <div class="empty-state">
                    <div class="icon">📭</div>
                    <h3>${t('media.noMediaFound')}</h3>
                    <p>${t('media.dragDropHint')}</p>
                  </div>
                ` : `
                  <div class="media-grid">
                    ${directories.map(dir => this._renderDirectoryCard(dir)).join('')}
                    ${mediaList.map(media => this._renderMediaCard(media, selectedMedia?.id === media.id)).join('')}
                  </div>
                `}
              </div>
              
              ${mobile ? '' : this._renderDetailPanel(selectedMedia)}
            </div>
            
            ${pagination.totalPages > 1 ? this._renderPagination(pagination) : ''}
          </div>
        </main>
      </div>
      
      ${this.state.showSettingsModal ? this._renderSettingsModal() : ''}
    `;
  }

  _renderDirectoryTree(dirs, parentPath, level = 0) {
    if (!dirs || dirs.length === 0) return '';
    
    return dirs.map(dir => {
      const fullPath = parentPath ? `${parentPath}/${dir.name}` : dir.name;
      const isExpanded = this.state.expandedDirs.has(fullPath);
      const isActive = store.currentPath === fullPath;
      const hasSub = !!dir.hasSubdirs;
      
      return `
        <li class="${isActive ? 'active' : ''}"
            data-dir-path="${escapeHtml(fullPath)}"
            style="padding-left:${12 + level * 16}px;">
          ${hasSub ? `
            <span class="toggle-dir ${isExpanded ? 'expanded' : ''}" data-dir-path="${escapeHtml(fullPath)}">
              ${isExpanded ? '▼' : '▶'}
            </span>
          ` : '<span style="width:16px;display:inline-block;"></span>'}
          <span>📁</span> <span class="dir-name" title="${escapeHtml(dir.name)}">${escapeHtml(dir.name)}</span>
        </li>
        ${isExpanded && dir.children ? this._renderDirectoryTree(dir.children, fullPath, level + 1) : ''}
      `;
    }).join('');
  }

  _renderDirectoryCard(dir) {
    return `
      <div class="media-card directory-card" data-dir-path="${escapeHtml(dir.path)}">
        <div class="media-thumbnail">
          <div class="placeholder">📁</div>
        </div>
        <div class="media-info">
          <h4 title="${escapeHtml(dir.name)}">${escapeHtml(dir.name)}</h4>
          <div class="meta">文件夹</div>
        </div>
      </div>
    `;
  }

  _renderMediaCard(media, isSelected) {
    const isGif = media.extension?.toLowerCase() === '.gif';
    const isAudio = media.file_type === 'audio';
    const isVideo = media.file_type === 'video';
    const token = api.getToken();
    const fileUrl = `/api/libraries/${media.library_id}/files/${encodeURIComponent(media.relative_path)}?token=${token}`;
    
    let thumbnailHtml = '';
    if (isGif) {
      thumbnailHtml = `<img data-src="${fileUrl}" alt="${escapeHtml(media.filename)}" loading="lazy" class="gif-preview lazy-thumbnail">`;
    } else if (media.thumbnailUrl) {
      thumbnailHtml = `
        <img data-src="${media.thumbnailUrl}" alt="${escapeHtml(media.filename)}" loading="lazy" class="lazy-thumbnail">
        ${isVideo ? `<div class="preview-video" data-src="${fileUrl}"></div>` : ''}
        ${isAudio ? `<div class="preview-audio" data-src="${fileUrl}"></div>` : ''}
      `;
    } else {
      thumbnailHtml = `
        <div class="placeholder">${getFileIcon(media.file_type)}</div>
        ${isVideo ? `<div class="preview-video" data-src="${fileUrl}"></div>` : ''}
        ${isAudio ? `<div class="preview-audio" data-src="${fileUrl}"></div>` : ''}
      `;
    }
    
    const durationHtml = (isVideo || isAudio) && media.duration
      ? `<span class="duration" data-duration="${media.duration}">${formatDuration(media.duration)}</span>`
      : '';
    
    const progressHtml = isVideo ? `<div class="preview-progress"><div class="progress-bar"></div></div>` : '';
    const typeBadgeHtml = `<span class="type-badge">${media.file_type}</span>`;
    const corruptedBadgeHtml = media.is_corrupted ? `<span class="corrupted-badge" title="文件解析失败">⚠️</span>` : '';
    const ratingHtml = media.rating > 0 ? `<div class="rating-stars">${'★'.repeat(media.rating)}${'☆'.repeat(5 - media.rating)}</div>` : '';
    
    return `
      <div class="media-card ${isSelected ? 'selected' : ''} ${media.is_corrupted ? 'corrupted' : ''}" data-id="${media.id}">
        <div class="media-thumbnail" data-path="${media.relative_path}" data-preview="${isVideo ? 'video' : isAudio ? 'audio' : ''}">
          ${thumbnailHtml}
          ${typeBadgeHtml}
          ${corruptedBadgeHtml}
          ${durationHtml}
          ${progressHtml}
          <button class="like-btn ${media.is_liked ? 'liked' : ''}" data-id="${media.id}" title="收藏">♥</button>
        </div>
        <div class="media-info">
          <h4 title="${escapeHtml(media.filename)}">${escapeHtml(media.filename)}</h4>
          <div class="meta">
            ${media.width && media.height ? `${media.width}×${media.height}` : ''}
            ${media.play_count ? `• ${t('media.playCount').replace('{count}', media.play_count)}` : ''}
          </div>
          ${ratingHtml}
        </div>
      </div>
    `;
  }

  _renderDetailPanel(media) {
    if (!media) {
      return `
        <div class="detail-panel show">
          <div class="detail-panel-header">
            <h3>${t('media.details')}</h3>
          </div>
          <div class="detail-panel-content">
            <div class="empty-detail" style="color:var(--text-secondary);font-size:14px;">
              ${t('media.noMediaSelected')}
            </div>
          </div>
        </div>
      `;
    }
    
    const ratingStars = [1, 2, 3, 4, 5].map(star => `
      <span class="rating-star ${star <= (media.rating || 0) ? 'active' : ''}" data-rating="${star}">★</span>
    `).join('');
    
    return `
      <div class="detail-panel show">
        <div class="detail-panel-header">
          <h3>${t('media.details')}</h3>
          <button class="btn-icon close-detail-btn">✕</button>
        </div>
        <div class="detail-panel-content">
          <div class="detail-section">
            <h4>${t('media.rating')}</h4>
            <div class="rating-input">${ratingStars}</div>
          </div>
          
          <div class="detail-section">
            <h4>${t('media.like')}</h4>
            <button class="like-btn-detail ${media.is_liked ? 'liked' : ''}">
              <span class="heart">♥</span> ${media.is_liked ? t('media.liked') : t('media.addLike')}
            </button>
          </div>
          
          <div class="detail-section">
            <h4>${t('media.filename')}</h4>
            <div class="value">${escapeHtml(media.filename)}</div>
          </div>
          
          <div class="detail-section">
            <h4>${t('media.path')}</h4>
            <div class="value" style="font-size:12px;word-break:break-all;">${escapeHtml(media.relative_path)}</div>
          </div>
          
          ${media.width && media.height ? `<div class="detail-section"><h4>${t('media.resolution')}</h4><div class="value">${media.width} × ${media.height}</div></div>` : ''}
          ${media.duration ? `<div class="detail-section"><h4>${t('media.duration')}</h4><div class="value">${formatDuration(media.duration)}</div></div>` : ''}
          ${media.file_size ? `<div class="detail-section"><h4>${t('media.fileSize')}</h4><div class="value">${formatFileSize(media.file_size)}</div></div>` : ''}
          
          <div class="detail-section">
            <h4>${t('media.tags')}</h4>
            <div class="tag-list">
              ${(media.tags || []).map((tag, index) => `
                <span class="tag">
                  ${escapeHtml(tag)}
                  <span class="remove" data-tag-index="${index}">✕</span>
                </span>
              `).join('')}
            </div>
            <div class="add-tag-input">
              <input type="text" class="new-tag-input" placeholder="${t('media.addTag')}">
              <button class="btn btn-secondary btn-small add-tag-btn">${t('confirm.add')}</button>
            </div>
          </div>
          
          <div class="detail-section">
            <button class="btn btn-danger delete-media-btn" style="width:100%;">${t('media.delete')}</button>
          </div>
        </div>
      </div>
    `;
  }

  _renderPagination(pagination) {
    return `
      <div class="pagination">
        <button ${pagination.page <= 1 ? 'disabled' : ''} data-page="${pagination.page - 1}">${t('pagination.previous')}</button>
        <span class="page-info">
          ${t('pagination.pageInfo', { current: pagination.page, total: pagination.totalPages, items: pagination.total })}
        </span>
        <button ${pagination.page >= pagination.totalPages ? 'disabled' : ''} data-page="${pagination.page + 1}">${t('pagination.next')}</button>
        <div class="page-size-select">
          <select class="page-size-select">
            <option value="20" ${pagination.pageSize === 20 ? 'selected' : ''}>${t('pagination.pageSize', { size: 20 })}</option>
            <option value="50" ${pagination.pageSize === 50 ? 'selected' : ''}>${t('pagination.pageSize', { size: 50 })}</option>
            <option value="72" ${pagination.pageSize === 72 ? 'selected' : ''}>${t('pagination.pageSize', { size: 72 })}</option>
            <option value="100" ${pagination.pageSize === 100 ? 'selected' : ''}>${t('pagination.pageSize', { size: 100 })}</option>
          </select>
        </div>
      </div>
    `;
  }

  _renderSettingsModal() {
    const languages = [
      { code: 'auto', name: t('settings.languageAuto') },
      { code: 'zh-CN', name: t('settings.languageZh') },
      { code: 'en-US', name: t('settings.languageEn') },
      { code: 'ja-JP', name: t('settings.languageJa') }
    ];
    
    const currentLang = store.getLanguage();
    
    return `
      <div class="modal-overlay settings-modal">
        <div class="modal">
          <div class="modal-header">
            <h2>${t('settings.title')}</h2>
            <button class="btn-icon close-settings-btn">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label for="language-select">${t('settings.language')}</label>
              <select id="language-select" class="language-select">
                ${languages.map(lang => `
                  <option value="${lang.code}" ${currentLang === lang.code || (lang.code === 'auto' && !localStorage.getItem('peechbrowser_language')) ? 'selected' : ''}>
                    ${lang.name}
                  </option>
                `).join('')}
              </select>
              <p style="font-size:12px;color:var(--text-secondary);margin-top:8px;">
                ${t('settings.languageHint')}
              </p>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary close-settings-btn">${t('confirm.close')}</button>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    this._bindSidebarEvents();
    this._bindHeaderEvents();
    this._bindMediaCardEvents();
    this._bindDetailPanelEvents();
    this._bindPaginationEvents();
    this._bindSettingsModalEvents();
    this._initLazyLoad();
  }

  _bindSidebarEvents() {
    this.$('.logo-btn')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('navigate-libraries'));
    });
    
    this.$$('li[data-type]').forEach(li => {
      li.addEventListener('click', () => {
        store.setFilterType(li.dataset.type);
        store.setLikedOnly(false);
        this._refresh({ page: 1 });
      });
    });
    
    this.$('li[data-filter="liked"]')?.addEventListener('click', () => {
      store.setLikedOnly(!store.likedOnly);
      this._refresh({ page: 1 });
    });
    
    this.$$('li[data-tag]').forEach(li => {
      li.addEventListener('click', () => {
        const tag = li.dataset.tag;
        store.setCurrentTag(store.currentTag === tag ? null : tag);
        this._refresh({ page: 1 });
      });
    });
    
    this.$$('li[data-dir-path]').forEach(li => {
      li.addEventListener('click', () => {
        const dirPath = li.dataset.dirPath;
        store.setCurrentPath(dirPath);
        this._refresh({ path: dirPath, page: 1 });
      });
    });
  }

  _bindHeaderEvents() {
    this.$('.back-btn')?.addEventListener('click', () => {
      const parts = store.currentPath.split('/');
      parts.pop();
      const parentPath = parts.join('/');
      store.setCurrentPath(parentPath);
      this._refresh({ path: parentPath, page: 1 });
    });
    
    this.$('.sync-btn')?.addEventListener('click', async () => {
      if (!store.currentLibrary) return;
      try {
        window.showToast?.(t('scan.syncing'), 'success');
        const result = await api.syncLibrary(store.currentLibrary.id);
        window.showToast?.(result.message, 'success');
        this._refresh();
      } catch (err) {
        window.showToast?.(err.message, 'error');
      }
    });
    
    this.$('.flatten-mode-checkbox')?.addEventListener('change', (e) => {
      store.setFlattenMode(e.target.checked);
      this._refresh({ page: 1 });
    });
    
    this.$('.search-input')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        store.setSearchQuery(e.target.value);
        this._refresh({ page: 1 });
      }
    });
    
    this.$('.logout-btn')?.addEventListener('click', () => {
      api.setToken(null);
      store.reset();
      window.dispatchEvent(new CustomEvent('logout'));
    });
    
    this.$('.settings-btn')?.addEventListener('click', () => {
      this.setState({ showSettingsModal: true });
    });
    
    const volumeSlider = this.$('.volume-slider');
    const volumeBtn = this.$('.volume-btn');
    
    volumeSlider?.addEventListener('input', (e) => {
      const volume = parseInt(e.target.value) / 100;
      this.setState({ previewVolume: volume });
      this._updatePreviewVolume(volume);
    });
    
    volumeBtn?.addEventListener('click', () => {
      const sliderContainer = this.$('.volume-slider-container');
      sliderContainer?.classList.toggle('show');
    });
    
    // Close volume slider when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.volume-control')) {
        const sliderContainer = this.$('.volume-slider-container');
        sliderContainer?.classList.remove('show');
      }
    });
  }

  _updatePreviewVolume(volume) {
    this.$$('video, audio').forEach(el => {
      el.volume = volume;
    });
  }

  _bindMediaCardEvents() {
    const mobile = isMobile();
    
    this.$$('.media-card[data-id]').forEach(card => {
      const mediaId = parseInt(card.dataset.id, 10);
      
      if (mobile) {
        card.addEventListener('click', (e) => {
          if (e.target.closest('.like-btn')) return;
          this._openPlayer(mediaId);
        });
      } else {
        card.addEventListener('click', (e) => {
          if (e.target.closest('.like-btn')) return;
          this._selectMedia(mediaId);
        });
        
        card.addEventListener('dblclick', (e) => {
          if (e.target.closest('.like-btn')) return;
          this._openPlayer(mediaId);
        });
      }
    });
    
    this.$$('.like-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const mediaId = parseInt(btn.dataset.id, 10);
        try {
          const result = await api.toggleLike(mediaId);
          btn.classList.toggle('liked', result.liked);
          store.updateMediaItem(mediaId, { is_liked: result.liked });
        } catch (err) {
          window.showToast?.(t('messages.operationFailed'), 'error');
        }
      });
    });
    
    this.$$('.directory-card').forEach(card => {
      card.addEventListener('click', () => {
        const dirPath = card.dataset.dirPath;
        store.setCurrentPath(dirPath);
        this._refresh({ path: dirPath, page: 1 });
      });
    });
    
    // Hover preview for video/audio
    if (!isMobile()) {
      this.$$('.media-thumbnail[data-preview]').forEach(thumbnail => {
        const previewType = thumbnail.dataset.preview;
        const previewDiv = thumbnail.querySelector('.preview-video, .preview-audio');
        if (!previewDiv) return;
        
        const src = previewDiv.dataset.src;
        let mediaEl = null;
        
        thumbnail.addEventListener('mouseenter', () => {
          if (this.state.hoverTimeout) {
            clearTimeout(this.state.hoverTimeout);
          }
          
          this.state.hoverTimeout = setTimeout(() => {
            if (previewType === 'video') {
              mediaEl = document.createElement('video');
              mediaEl.src = src;
              mediaEl.muted = this.state.previewVolume === 0;
              mediaEl.loop = true;
              mediaEl.volume = this.state.previewVolume;
              mediaEl.play().catch(() => {});
              
              // Add seek on mouse move
              let isSeeking = false;
              thumbnail.addEventListener('mousemove', (e) => {
                if (!mediaEl || isSeeking) return;
                const rect = thumbnail.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const percent = Math.max(0, Math.min(1, x / rect.width));
                if (mediaEl.duration) {
                  mediaEl.currentTime = percent * mediaEl.duration;
                }
              });
              
            } else if (previewType === 'audio') {
              mediaEl = document.createElement('audio');
              mediaEl.src = src;
              mediaEl.volume = this.state.previewVolume;
              mediaEl.play().catch(() => {});
            }
            
            if (mediaEl) {
              mediaEl.className = 'hover-preview-media';
              previewDiv.innerHTML = '';
              previewDiv.appendChild(mediaEl);
              this.state.hoverVideo = mediaEl;
            }
          }, 300);
        });
        
        thumbnail.addEventListener('mouseleave', () => {
          if (this.state.hoverTimeout) {
            clearTimeout(this.state.hoverTimeout);
            this.state.hoverTimeout = null;
          }
          
          if (mediaEl) {
            mediaEl.pause();
            mediaEl.remove();
            mediaEl = null;
          }
          previewDiv.innerHTML = '';
          this.state.hoverVideo = null;
        });
      });
    }
  }

  _bindDetailPanelEvents() {
    this.$('.close-detail-btn')?.addEventListener('click', () => {
      store.setSelectedMedia(null);
      this.update();
    });
    
    this.$$('.rating-star').forEach(star => {
      star.addEventListener('click', async () => {
        if (!store.selectedMedia) return;
        const rating = parseInt(star.dataset.rating, 10);
        try {
          await api.setRating(store.selectedMedia.id, rating);
          store.selectedMedia.rating = rating;
          store.updateMediaItem(store.selectedMedia.id, { rating });
          this.update();
          window.showToast?.(t('messages.ratingSaved'), 'success');
        } catch (err) {
          window.showToast?.(err.message, 'error');
        }
      });
    });
    
    this.$('.like-btn-detail')?.addEventListener('click', async () => {
      if (!store.selectedMedia) return;
      try {
        const result = await api.toggleLike(store.selectedMedia.id);
        store.selectedMedia.is_liked = result.liked;
        store.updateMediaItem(store.selectedMedia.id, { is_liked: result.liked });
        this.update();
      } catch (err) {
        window.showToast?.(err.message, 'error');
      }
    });
    
    this.$('.add-tag-btn')?.addEventListener('click', async () => {
      const input = this.$('.new-tag-input');
      const tagName = input?.value?.trim();
      if (!tagName || !store.selectedMedia) return;
      
      try {
        await api.addTag(store.selectedMedia.id, tagName);
        const media = await api.getMediaDetail(store.selectedMedia.id);
        store.setSelectedMedia(media);
        this.update();
        input.value = '';
      } catch (err) {
        window.showToast?.(err.message, 'error');
      }
    });
    
    this.$('.delete-media-btn')?.addEventListener('click', async () => {
      if (!store.selectedMedia) return;
      if (!confirm(t('media.deleteConfirm'))) return;
      
      try {
        await api.deleteMedia(store.selectedMedia.id);
        store.setSelectedMedia(null);
        this._refresh();
        window.showToast?.(t('messages.fileDeleted'), 'success');
      } catch (err) {
        window.showToast?.(err.message, 'error');
      }
    });
  }

  _bindPaginationEvents() {
    this.$$('.pagination button[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = parseInt(btn.dataset.page, 10);
        this._refresh({ page });
      });
    });
    
    this.$('.page-size-select')?.addEventListener('change', (e) => {
      this._refresh({ pageSize: parseInt(e.target.value, 10), page: 1 });
    });
  }

  _bindSettingsModalEvents() {
    const modal = this.$('.settings-modal');
    if (!modal) return;
    
    this.$$('.close-settings-btn', modal).forEach(btn => {
      btn.addEventListener('click', () => {
        this.setState({ showSettingsModal: false });
      });
    });
    
    this.$('.language-select', modal)?.addEventListener('change', (e) => {
      const lang = e.target.value;
      if (lang === 'auto') {
        localStorage.removeItem('peechbrowser_language');
        store.setLanguage(i18n.detectLanguage());
      } else {
        store.setLanguage(lang);
      }
      this.setState({ showSettingsModal: false });
      setTimeout(() => {
        this.update();
        this.bindEvents();
      }, 50);
    });
  }

  _initLazyLoad() {
    if (this.state.lazyObserver) {
      this.state.lazyObserver.disconnect();
    }
    
    this.state.lazyObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const img = entry.target;
            if (img.dataset.src) {
              img.src = img.dataset.src;
              img.onload = () => img.classList.add('loaded');
              img.onerror = () => img.classList.add('error');
              delete img.dataset.src;
              this.state.lazyObserver.unobserve(img);
            }
          }
        });
      },
      { rootMargin: '100px', threshold: 0 }
    );
    
    this.$$('.lazy-thumbnail[data-src]').forEach((img) => {
      this.state.lazyObserver.observe(img);
    });
  }

  async _selectMedia(mediaId) {
    const cachedMedia = store.mediaList.find(m => m.id === mediaId);
    if (cachedMedia) {
      store.setSelectedMedia(cachedMedia);
      this.update();
    } else {
      try {
        const media = await api.getMediaDetail(mediaId);
        store.setSelectedMedia(media);
        this.update();
      } catch (err) {
        console.error('Failed to get media detail:', err);
      }
    }
  }

  async _openPlayer(mediaId) {
    try {
      const mediaDetail = await api.getMediaDetail(mediaId);
      if (mediaDetail?.is_corrupted) {
        alert('此文件无法播放');
        return;
      }
      
      const currentPath = store.currentPath || '';
      const playerUrl = new URL('/player.html', window.location.origin);
      playerUrl.searchParams.set('mediaId', mediaId);
      playerUrl.searchParams.set('libraryId', mediaDetail.library_id);
      playerUrl.searchParams.set('token', api.getToken());
      if (currentPath) playerUrl.searchParams.set('path', currentPath);
      
      window.location.href = playerUrl.href;
    } catch (err) {
      console.error('Failed to open player:', err);
    }
  }

  async _refresh(params = {}) {
    if (!store.currentLibrary) return;
    
    await this.loadMedia(store.currentLibrary.id, {
      page: params.page || store.pagination.page,
      pageSize: params.pageSize || store.pagination.pageSize,
      path: params.path !== undefined ? params.path : store.currentPath
    });
    
    this.update();
  }

  async loadMedia(libraryId, params = {}) {
    // Cancel any pending load
    if (this._currentLoadId && this._currentLoadId !== libraryId) {
      this._currentLoadId = libraryId;
      return;
    }
    this._currentLoadId = libraryId;
    
    const currentLoadId = libraryId;
    
    // Set current library for display
    const library = store.libraries.find(l => l.id === libraryId);
    if (library) {
      store.setCurrentLibrary(library);
    }
    
    try {
      const data = await api.getMedia(libraryId, {
        page: params.page || 1,
        pageSize: params.pageSize || 50,
        type: store.filterType,
        tag: store.currentTag || '',
        search: store.searchQuery,
        path: params.path || store.currentPath || '',
        recursive: store.flattenMode ? 'true' : 'false',
        liked: store.likedOnly ? 'true' : ''
      });
      
      // Check if this is still the current load
      if (this._currentLoadId !== currentLoadId) {
        return;
      }
      
      store.setMediaList(data.media, data.directories, data.currentPath, data.pagination);
      store.setCurrentLibrary(data.library);
      
      const tags = await api.getTags(libraryId);
      
      // Check again after async operation
      if (this._currentLoadId !== currentLoadId) {
        return;
      }
      
      store.setTags(tags);
      
      const dirs = await api.getDirectoryStructure(libraryId, '');
      
      // Check one more time
      if (this._currentLoadId !== currentLoadId) {
        return;
      }
      
      this.state.directoryTree = dirs;
    } catch (err) {
      console.error('Failed to load media:', err);
    } finally {
      if (this._currentLoadId === currentLoadId) {
        this._currentLoadId = null;
      }
    }
  }

  _cleanup() {
    if (this.state.hoverTimeout) {
      clearTimeout(this.state.hoverTimeout);
      this.state.hoverTimeout = null;
    }
    
    if (this.state.lazyObserver) {
      this.state.lazyObserver.disconnect();
      this.state.lazyObserver = null;
    }
  }
}
