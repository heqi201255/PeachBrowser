const BrowserPage = {
  hoverVideo: null,
  hoverTimeout: null,
  detailPanelOpen: false,
  playerOpen: false,
  currentMedia: null,
  expandedDirs: new Set(),
  directoryTree: [],
  previewVolume: 0.5,
  savedTreeScrollTop: 0,
  directoryNavActive: false,
  directoryNavPath: null,
  keydownHandler: null,
  clickOffHandler: null,

  // --- Helpers for directory tree state ---
  // Recursively set children for a node at fullPath within a tree list
  setChildrenAtPath(fullPath, children) {
    if (!fullPath) {
      // Replace top-level
      this.directoryTree = children || [];
      return true;
    }
    const recur = (nodes, parentPath = '') => {
      if (!nodes) return false;
      for (const node of nodes) {
        const nodePath = parentPath ? `${parentPath}/${node.name}` : node.name;
        if (nodePath === fullPath) {
          node.children = children || [];
          return true;
        }
        if (node.children && recur(node.children, nodePath)) return true;
      }
      return false;
    };
    return recur(this.directoryTree, '');
  },

  // Returns node if present in memory
  getNodeAtPath(fullPath) {
    if (!fullPath) return null;
    const recur = (nodes, parentPath = '') => {
      if (!nodes) return null;
      for (const node of nodes) {
        const nodePath = parentPath ? `${parentPath}/${node.name}` : node.name;
        if (nodePath === fullPath) return node;
        const found = recur(node.children, nodePath);
        if (found) return found;
      }
      return null;
    };
    return recur(this.directoryTree, '');
  },

  isMobile() {
    return (
      window.matchMedia('(max-width: 768px)').matches ||
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0
    );
  },

  cleanup() {
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }

    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }

    if (this.clickOffHandler) {
      document.removeEventListener('click', this.clickOffHandler);
      this.clickOffHandler = null;
    }

    document
      .querySelectorAll('.preview-video video, .preview-audio audio')
      .forEach((media) => {
        media.pause();
        media.src = '';
        media.load();
        media.remove();
      });

    if (this.lazyObserver) {
      this.lazyObserver.disconnect();
      this.lazyObserver = null;
    }

    const oldContainer = document.getElementById('app');
    if (oldContainer) {
      const oldCards = oldContainer.querySelectorAll('.media-card');
      oldCards.forEach((card) => {
        const clone = card.cloneNode(true);
        card.replaceWith(clone);
      });
    }
  },

  async init(libraryId, params = {}) {
    store.setCurrentLibrary(store.libraries.find((l) => l.id === libraryId));

    this.updateUrl(libraryId, params.path || store.currentPath || '');

    try {
      const data = await api.getMedia(libraryId, {
        page: params.page || 1,
        pageSize: params.pageSize || 50,
        type: params.type || 'all',
        tag: params.tag || '',
        search: params.search || '',
        path: params.path || store.currentPath || '',
        recursive: store.flattenMode ? 'true' : 'false',
      });

      store.setMediaList(
        data.media,
        data.directories,
        data.currentPath,
        data.pagination
      );
      store.setCurrentLibrary(data.library);

      // Load tags specific to this library
      const tags = await api.getTags(libraryId);
      store.setTags(tags);

      // Load directory tree root
      await this.loadDirectoryTree(libraryId);
    } catch (err) {
      console.error('Failed to load media:', err);
    }
  },

  async loadDirectoryTree(libraryId, parentPath = '') {
    try {
      const dirs = await api.getDirectoryStructure(libraryId, parentPath);
      if (!parentPath) {
        this.directoryTree = this.mergeDirectoryTrees(this.directoryTree, dirs);
      }
      return dirs;
    } catch (err) {
      console.error('Failed to load directory tree:', err);
      return [];
    }
  },

  mergeDirectoryTrees(oldTree, newTree) {
    if (!oldTree || oldTree.length === 0) return newTree;
    const oldMap = new Map(oldTree.map((d) => [d.name, d]));
    return newTree.map((newDir) => {
      const oldDir = oldMap.get(newDir.name);
      if (oldDir && oldDir.children) {
        return { ...newDir, children: oldDir.children };
      }
      return newDir;
    });
  },

  render() {
    this.cleanup();

    const app = document.getElementById('app');
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
      selectedMedia,
    } = store;

    const showBackButton = currentPath !== '';
    const isDesktop = !this.isMobile();

    app.innerHTML = `
      <div class="app-layout">
        <aside class="sidebar">
          <div class="sidebar-header">
            <h2 id="logoBtn" style="cursor:pointer;display:flex;align-items:center;gap:8px;">
              <img src="assets/logo.png" alt="Logo" style="width:24px;height:24px;">
              PeachBrowser
            </h2>
          </div>

          <div class="sidebar-section">
            <h3>筛选</h3>
            <ul class="sidebar-nav">
              <li class="${filterType === 'all' ? 'active' : ''}" data-type="all">
                <span>📁</span> 全部
              </li>
              <li class="${filterType === 'video' ? 'active' : ''}" data-type="video">
                <span>🎬</span> 视频
              </li>
              <li class="${filterType === 'image' ? 'active' : ''}" data-type="image">
                <span>🖼</span> 图片
              </li>
              <li class="${filterType === 'audio' ? 'active' : ''}" data-type="audio">
                <span>🎵</span> 音频
              </li>
            </ul>
          </div>

          <div class="sidebar-section">
            <h3>目录</h3>
            <ul class="sidebar-nav directory-tree">
              ${this.renderDirectoryTree(this.directoryTree, '')}
            </ul>
          </div>

          <div class="sidebar-section">
            <h3>标签</h3>
            <ul class="sidebar-nav">
              ${tags
                .map(
                  (tag) => `
                <li class="${
                  currentTag === tag.name ? 'active' : ''
                }" data-tag="${this.escapeHtml(tag.name)}">
                  <span style="color:#3498db">#</span> ${this.escapeHtml(
                    tag.name
                  )}
                  <span class="count">${tag.media_count}</span>
                </li>
              `
                )
                .join('')}
            </ul>
          </div>
        </aside>

        <main class="main-content ${isDesktop ? 'has-detail-panel' : ''}">
          <header class="header">
            <div style="display:flex;align-items:center;gap:12px;">
              ${
                showBackButton
                  ? `<button class="btn btn-secondary btn-small" id="backBtn">← 返回</button>`
                  : ''
              }
              <div>
                <h1>${
                  currentLibrary ? this.escapeHtml(currentLibrary.name) : '媒体库'
                }</h1>
                ${
                  currentPath
                    ? `<div style="font-size:12px;color:var(--text-secondary);">${this.escapeHtml(
                        currentPath
                      )}</div>`
                    : ''
                }
              </div>
            </div>
            <div class="header-actions">
              <div class="volume-control">
                <div class="volume-slider-container" id="volumeSliderContainer">
                  <input type="range" id="volumeSlider" min="0" max="100" value="${
                    this.previewVolume * 100
                  }">
                </div>
                <button class="volume-btn" id="volumeBtn" title="预览音量">🔊</button>
                
              </div>
              <label class="flatten-mode-label">
                <input type="checkbox" id="flattenMode" ${store.flattenMode ? 'checked' : ''}>
                <span>展开模式</span>
              </label>
              <button class="btn btn-secondary btn-small" id="syncBtn">🔄 同步</button>
              <div class="search-box">
                <input type="text" id="searchInput" placeholder="搜索文件..." value="${searchQuery}">
              </div>
              <div class="user-menu">
                <button class="user-menu-btn" id="userMenuBtn">
                  <span>👤</span>
                  <span>${store.user?.username || 'User'}</span>
                </button>
                <div class="user-menu-dropdown" id="userMenuDropdown">
                  <button id="logoutBtn">退出登录</button>
                </div>
              </div>
            </div>
          </header>

          <div class="content-wrapper">
            <div class="main-content-area">
              <div class="content" id="dropZone">
                ${
                  directories.length === 0 && mediaList.length === 0
                    ? `
                  <div class="empty-state">
                    <div class="icon">📭</div>
                    <h3>没有找到媒体文件</h3>
                    <p>拖拽文件到这里上传，或等待扫描完成</p>
                  </div>
                `
                    : `
                  <div class="media-grid">
                    ${directories.map((dir) => this.renderDirectoryCard(dir)).join('')}
                    ${mediaList.map((media) => this.renderMediaCard(media)).join('')}
                  </div>
                `
                }
              </div>

              ${
                isDesktop
                  ? `${
                      store.selectedMedia
                        ? this.renderDetailPanel(store.selectedMedia)
                        : this.renderEmptyDetailPanel()
                    }`
                  : ''
              }
            </div>

            ${
              pagination.totalPages > 1
                ? `
              <div class="pagination">
                <button ${
                  pagination.page <= 1 ? 'disabled' : ''
                } data-page="${pagination.page - 1}">上一页</button>
                <span class="page-info">
                  第 ${pagination.page} / ${pagination.totalPages} 页 (共 ${pagination.total} 项)
                </span>
                <button ${
                  pagination.page >= pagination.totalPages ? 'disabled' : ''
                } data-page="${pagination.page + 1}">下一页</button>
                <div class="page-size-select">
                  <select id="pageSizeSelect">
                    <option value="20" ${
                      pagination.pageSize === 20 ? 'selected' : ''
                    }>20/页</option>
                    <option value="50" ${
                      pagination.pageSize === 50 ? 'selected' : ''
                    }>50/页</option>
                    <option value="72" ${
                      pagination.pageSize === 72 ? 'selected' : ''
                    }>72/页</option>
                    <option value="100" ${
                      pagination.pageSize === 100 ? 'selected' : ''
                    }>100/页</option>
                    <option value="200" ${
                      pagination.pageSize === 200 ? 'selected' : ''
                    }>200/页</option>
                  </select>
                </div>
              </div>
            `
                : ''
            }
          </div>
        </main>
      </div>

      ${this.playerOpen && this.currentMedia ? PlayerModal.render(this.currentMedia) : ''}
    `;

    this.bindEvents();
    this.initLazyLoad();

    const tree = document.querySelector('.directory-tree');
    if (tree && this.savedTreeScrollTop) {
      tree.scrollTop = this.savedTreeScrollTop;
    }
  },

  initLazyLoad() {
    if (this.lazyObserver) {
      this.lazyObserver.disconnect();
    }

    this.lazyObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const img = entry.target;
            if (img.dataset.src) {
              img.src = img.dataset.src;
              img.onload = () => img.classList.add('loaded');
              img.onerror = () => img.classList.add('error');
              delete img.dataset.src;
              this.lazyObserver.unobserve(img);
            }
          }
        });
      },
      { rootMargin: '100px', threshold: 0 }
    );

    document.querySelectorAll('.lazy-thumbnail[data-src]').forEach((img) => {
      this.lazyObserver.observe(img);
    });
  },

  renderDirectoryTree(dirs, parentPath, level = 0) {
    if (!dirs || dirs.length === 0) return '';

    return dirs
      .map((dir) => {
        const fullPath = parentPath ? `${parentPath}/${dir.name}` : dir.name;
        const isExpanded = this.expandedDirs.has(fullPath);
        const isActive = store.currentPath === fullPath;
        const hasSub = !!dir.hasSubdirs;

        return `
        <li class="${isActive ? 'active' : ''}"
            data-dir-path="${this.escapeHtml(fullPath)}"
            style="padding-left:${12 + level * 16}px;">
          ${
            hasSub
              ? `
            <span class="toggle-dir ${isExpanded ? 'expanded' : ''}"
                  data-dir-path="${this.escapeHtml(fullPath)}">
              ${isExpanded ? '▼' : '▶'}
            </span>`
              : '<span style="width:16px;display:inline-block;"></span>'
          }
          <span>📁</span> <span class="dir-name" title="${this.escapeHtml(dir.name)}">${this.escapeHtml(dir.name)}</span>
        </li>
        ${
          isExpanded && dir.children
            ? this.renderDirectoryTree(dir.children, fullPath, level + 1)
            : ''
        }
      `;
      })
      .join('');
  },

  renderDirectoryCard(dir) {
    return `
      <div class="media-card directory-card" data-dir-path="${this.escapeHtml(
        dir.path
      )}">
        <div class="media-thumbnail">
          <div class="placeholder">📁</div>
        </div>
        <div class="media-info">
          <h4 title="${this.escapeHtml(dir.name)}">${this.escapeHtml(dir.name)}</h4>
          <div class="meta">文件夹</div>
        </div>
      </div>
    `;
  },

  renderMediaCard(media) {
    const fileIcon = this.getFileIcon(media.file_type);
    const isGif = media.extension?.toLowerCase() === '.gif';
    const isAudio = media.file_type === 'audio';
    const isVideo = media.file_type === 'video';

    const fileUrl = api.getFileUrl(media.library_id, media.relative_path);

    let thumbnailHtml;
    let previewType = '';
    
    if (isGif) {
      thumbnailHtml = `<img data-src="${fileUrl}" alt="${this.escapeHtml(
        media.filename
      )}" loading="lazy" class="gif-preview lazy-thumbnail">`;
    } else if (media.thumbnailUrl) {
      if (isAudio) {
        previewType = 'audio';
        thumbnailHtml = `<img data-src="${media.thumbnailUrl}" alt="${this.escapeHtml(
          media.filename
        )}" loading="lazy" class="lazy-thumbnail">
          <div class="preview-audio" data-src="${fileUrl}"></div>`;
      } else {
        previewType = isVideo ? 'video' : '';
        thumbnailHtml = `<img data-src="${media.thumbnailUrl}" alt="${this.escapeHtml(
          media.filename
        )}" loading="lazy" class="lazy-thumbnail">
          ${
            isVideo
              ? `<div class="preview-video" data-src="${fileUrl}"></div>`
              : ''
          }`;
      }
    } else if (isAudio) {
      previewType = 'audio';
      thumbnailHtml = `<div class="placeholder">${fileIcon}</div>
        <div class="preview-audio" data-src="${fileUrl}"></div>`;
    } else {
      previewType = isVideo ? 'video' : '';
      thumbnailHtml = `<div class="placeholder">${fileIcon}</div>
        ${
          isVideo
            ? `<div class="preview-video" data-src="${fileUrl}"></div>`
            : ''
        }`;
    }

    const durationHtml = (media.file_type === 'video' || media.file_type === 'audio') && media.duration
      ? `<span class="duration" data-duration="${media.duration}">${this.formatDuration(media.duration)}</span>`
      : '';

    const progressHtml = media.file_type === 'video'
      ? `<div class="preview-progress"><div class="progress-bar"></div></div>`
      : '';

    const typeBadgeHtml = `<span class="type-badge">${media.file_type}</span>`;

    const corruptedBadgeHtml = media.is_corrupted
      ? `<span class="corrupted-badge" title="文件解析失败">⚠️</span>`
      : '';

    const ratingHtml =
      media.rating > 0
        ? `<div class="rating-stars">${'★'.repeat(media.rating)}${'☆'.repeat(
            5 - media.rating
          )}</div>`
        : '';

    return `
      <div class="media-card ${
        store.selectedMedia?.id === media.id ? 'selected' : ''
      } ${media.is_corrupted ? 'corrupted' : ''}" data-id="${media.id}">
        <div class="media-thumbnail" data-path="${media.relative_path}" data-preview="${previewType}">
          ${thumbnailHtml}
          ${typeBadgeHtml}
          ${corruptedBadgeHtml}
          ${durationHtml}
          ${progressHtml}
        </div>
        <div class="media-info">
          <h4 title="${this.escapeHtml(media.filename)}">${this.escapeHtml(
            media.filename
          )}</h4>
          <div class="meta">
            ${media.width && media.height ? `${media.width}×${media.height}` : ''}
            ${media.play_count ? `• 播放${media.play_count}次` : ''}
          </div>
          ${ratingHtml}
        </div>
      </div>
    `;
  },

  renderDetailPanel(media) {
    const ratingStars = [1, 2, 3, 4, 5]
      .map(
        (star) => `
      <span class="rating-star ${star <= media.rating ? 'active' : ''}" data-rating="${star}">★</span>
    `
      )
      .join('');

    return `
      <div class="detail-panel show">
        <div class="detail-panel-header">
          <h3>文件详情</h3>
          <button class="btn-icon" id="closeDetail">✕</button>
        </div>
        <div class="detail-panel-content">
          <div class="detail-section">
            <h4>评分</h4>
            <div class="rating-input" id="ratingInput">
              ${ratingStars}
            </div>
          </div>

          <div class="detail-section">
            <h4>文件名</h4>
            <div class="value">${this.escapeHtml(media.filename)}</div>
          </div>

          <div class="detail-section">
            <h4>路径</h4>
            <div class="value" style="font-size:12px;word-break:break-all;">${this.escapeHtml(
              media.relative_path
            )}</div>
          </div>

          ${
            media.width && media.height
              ? `
            <div class="detail-section">
              <h4>分辨率</h4>
              <div class="value">${media.width} × ${media.height}</div>
            </div>
          `
              : ''
          }

          ${
            media.duration
              ? `
            <div class="detail-section">
              <h4>时长</h4>
              <div class="value">${this.formatDuration(media.duration)}</div>
            </div>
          `
              : ''
          }

          ${
            media.fps
              ? `
            <div class="detail-section">
              <h4>帧率</h4>
              <div class="value">${media.fps.toFixed(2)} fps</div>
            </div>
          `
              : ''
          }

          ${
            media.bitrate
              ? `
            <div class="detail-section">
              <h4>比特率</h4>
              <div class="value">${(media.bitrate / 1000).toFixed(0)} kbps</div>
            </div>
          `
              : ''
          }

          ${
            media.codec
              ? `
            <div class="detail-section">
              <h4>编码</h4>
              <div class="value">${media.codec}</div>
            </div>
          `
              : ''
          }

          ${
            media.file_size
              ? `
            <div class="detail-section">
              <h4>文件大小</h4>
              <div class="value">${this.formatFileSize(media.file_size)}</div>
            </div>
          `
              : ''
          }

          <div class="detail-section">
            <h4>标签</h4>
            <div class="tag-list" id="tagList">
              ${(media.tags || [])
                .map(
                  (tag, index) => `
                <span class="tag">
                  ${this.escapeHtml(tag)}
                  <span class="remove" data-tag-index="${index}">✕</span>
                </span>
              `
                )
                .join('')}
            </div>
            <div class="add-tag-input">
              <input type="text" id="newTagInput" placeholder="添加标签...">
              <button class="btn btn-secondary btn-small" id="addTagBtn">添加</button>
            </div>
          </div>

          <div class="detail-section">
            <button class="btn btn-danger" id="deleteMediaBtn" style="width:100%;">删除文件</button>
          </div>
        </div>
      </div>
    `;
  },

  // Placeholder panel when nothing is selected (desktop only)
  renderEmptyDetailPanel() {
    return `
      <div class="detail-panel show">
        <div class="detail-panel-header">
          <h3>文件详情</h3>
        </div>
        <div class="detail-panel-content">
          <div class="empty-detail" style="color:var(--text-secondary);font-size:14px;">
            未选择任何文件。请在左侧选择一个文件查看详情。
          </div>
        </div>
      </div>
    `;
  },

  bindEvents() {
    // Logo menu
    document.getElementById('logoBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = document.createElement('div');
      menu.className = 'dropdown-menu';
      menu.innerHTML = `
        <button id="backToLibraries">返回媒体库</button>
      `;
      menu.style.cssText =
        'position:absolute;top:60px;left:20px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:8px;padding:8px 0;min-width:150px;z-index:1000;';

      document.body.appendChild(menu);

      const closeMenu = () => {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      };

      setTimeout(() => {
        document.addEventListener('click', closeMenu);
      }, 0);

      document.getElementById('backToLibraries')?.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('navigate-libraries'));
      });
    });

    // Back button
    document.getElementById('backBtn')?.addEventListener('click', () => {
      const parts = store.currentPath.split('/');
      parts.pop();
      const parentPath = parts.join('/');
      store.setCurrentPath(parentPath);
      this.refresh({ path: parentPath, page: 1 });
    });

    // Sync button
    document.getElementById('syncBtn')?.addEventListener('click', async () => {
      if (!store.currentLibrary) return;
      try {
        showToast('正在同步...', 'success');
        const result = await api.syncLibrary(store.currentLibrary.id);
        showToast(result.message, 'success');
        this.refresh();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    // Volume control
    document.getElementById('volumeBtn')?.addEventListener('click', () => {
      document.getElementById('volumeSliderContainer')?.classList.toggle('show');
    });

    document.getElementById('volumeSlider')?.addEventListener('input', (e) => {
      this.previewVolume = e.target.value / 100;
      const volumeBtn = document.getElementById('volumeBtn');
      if (volumeBtn) {
        volumeBtn.textContent =
          this.previewVolume === 0 ? '🔇' : this.previewVolume < 0.5 ? '🔉' : '🔊';
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.volume-control')) {
        document.getElementById('volumeSliderContainer')?.classList.remove('show');
      }
    });

    // Flatten mode toggle
    document.getElementById('flattenMode')?.addEventListener('change', (e) => {
      store.setFlattenMode(e.target.checked);
      this.refresh({ page: 1 });
    });

    // Directory cards
    document.querySelectorAll('.directory-card').forEach((card) => {
      card.addEventListener('click', () => {
        const dirPath = card.dataset.dirPath;
        store.setCurrentPath(dirPath);
        this.refresh({ path: dirPath, page: 1 });
      });
    });

    // Directory tree expand/collapse
    document.querySelectorAll('.toggle-dir').forEach((toggle) => {
      toggle.addEventListener('click', async (e) => {
        e.stopPropagation();
        const dirPath = toggle.dataset.dirPath;
        const directoryTree = document.querySelector('.directory-tree');
        if (directoryTree) {
          this.savedTreeScrollTop = directoryTree.scrollTop;
        }

        if (this.expandedDirs.has(dirPath)) {
          this.expandedDirs.delete(dirPath);
          this.render();
          return;
        }

        this.expandedDirs.add(dirPath);

        try {
          const node = this.getNodeAtPath(dirPath);
          if (!node || !node.children || node.children.length === 0) {
            const children = await api.getDirectoryStructure(
              store.currentLibrary.id,
              dirPath
            );
            this.setChildrenAtPath(dirPath, children || []);
          }
        } catch (err) {
          console.error('Failed to load subdirectories:', err);
        }

        this.render();
      });
    });

    // Directory tree navigation
    const dirTreeItems = document.querySelectorAll('.directory-tree li[data-dir-path]');
    
    dirTreeItems.forEach((li) => {
      li.addEventListener('click', (e) => {
        const dirPath = li.dataset.dirPath;
        const tree = document.querySelector('.directory-tree');
        if (tree) {
          this.savedTreeScrollTop = tree.scrollTop;
        }
        
        this.directoryNavActive = true;
        this.directoryNavPath = dirPath;
        
        store.setCurrentPath(dirPath);
        this.refresh({ path: dirPath, page: 1 });
      });
    });

    if (this.directoryNavActive && this.directoryNavPath) {
      const activeItem = document.querySelector(`.directory-tree li[data-dir-path="${this.directoryNavPath}"]`);
      if (activeItem) {
        activeItem.classList.add('nav-focused');
      }
    }

    if (this.clickOffHandler) {
      document.removeEventListener('click', this.clickOffHandler);
    }
    this.clickOffHandler = (e) => {
      if (!e.target.closest('.directory-tree') && this.directoryNavActive) {
        this.directoryNavActive = false;
        this.directoryNavPath = null;
        document.querySelectorAll('.directory-tree li.nav-focused').forEach(item => item.classList.remove('nav-focused'));
      }
    };
    document.addEventListener('click', this.clickOffHandler);

    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
    }
    this.keydownHandler = (e) => {
      if (!this.directoryNavActive) return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return;
      
      const items = Array.from(document.querySelectorAll('.directory-tree li[data-dir-path]'));
      const currentFocused = document.querySelector('.directory-tree li.nav-focused');
      const currentIndex = items.indexOf(currentFocused);
      
      if (e.key === 'ArrowDown' && currentIndex < items.length - 1) {
        e.preventDefault();
        items[currentIndex].classList.remove('nav-focused');
        items[currentIndex + 1].classList.add('nav-focused');
        this.directoryNavPath = items[currentIndex + 1].dataset.dirPath;
        items[currentIndex + 1].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp' && currentIndex > 0) {
        e.preventDefault();
        items[currentIndex].classList.remove('nav-focused');
        items[currentIndex - 1].classList.add('nav-focused');
        this.directoryNavPath = items[currentIndex - 1].dataset.dirPath;
        items[currentIndex - 1].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && currentIndex >= 0) {
        const dirPath = items[currentIndex].dataset.dirPath;
        const tree = document.querySelector('.directory-tree');
        if (tree) {
          this.savedTreeScrollTop = tree.scrollTop;
        }
        store.setCurrentPath(dirPath);
        this.refresh({ path: dirPath, page: 1 });
      }
    };
    document.addEventListener('keydown', this.keydownHandler);

    // User menu
    document.getElementById('userMenuBtn')?.addEventListener('click', () => {
      document.getElementById('userMenuDropdown')?.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.user-menu')) {
        document.getElementById('userMenuDropdown')?.classList.remove('show');
      }
    });

    document.getElementById('logoutBtn')?.addEventListener('click', () => {
      api.setToken(null);
      store.reset();
      window.dispatchEvent(new CustomEvent('logout'));
    });

    // Search
    document.getElementById('searchInput')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        store.setSearchQuery(e.target.value);
        this.refresh({ page: 1 });
      }
    });

    // Filter type
    document.querySelectorAll('.sidebar-nav li[data-type]').forEach((li) => {
      li.addEventListener('click', () => {
        store.setFilterType(li.dataset.type);
        this.refresh({ page: 1 });
      });
    });

    // Tags
    document.querySelectorAll('.sidebar-nav li[data-tag]').forEach((li) => {
      li.addEventListener('click', () => {
        const tag = li.dataset.tag;
        store.setCurrentTag(store.currentTag === tag ? null : tag);
        this.refresh({ page: 1 });
      });
    });

    // Media cards
    document.querySelectorAll('.media-card[data-id]').forEach((card) => {
      const mediaId = parseInt(card.dataset.id, 10);

      if (this.isMobile()) {
        // Mobile: tap opens player directly
        card.addEventListener('click', (e) => {
          if (e.target.closest('.tag .remove')) return;
          this.openPlayer(mediaId);
        });
      } else {
        // Desktop: single click selects, double click opens player
        card.addEventListener('click', (e) => {
          if (e.target.closest('.tag .remove')) return;
          this.selectMedia(mediaId);
        });

        card.addEventListener('dblclick', () => {
          this.openPlayer(mediaId);
        });

        const thumbnailEl = card.querySelector('.media-thumbnail');
        const previewVideoEl = thumbnailEl?.querySelector('.preview-video');
        const previewAudioEl = thumbnailEl?.querySelector('.preview-audio');

        if (previewVideoEl) {
          let videoEl = null;
          let durationEl = thumbnailEl?.querySelector('.duration');
          let progressBar = thumbnailEl?.querySelector('.progress-bar');
          const totalDuration = durationEl?.dataset?.duration ? parseFloat(durationEl.dataset.duration) : null;
          let originalDurationText = durationEl?.textContent || '';
          
          const updateProgress = () => {
            if (!videoEl || !videoEl.duration) return;
            const percent = (videoEl.currentTime / videoEl.duration) * 100;
            if (progressBar) {
              progressBar.style.width = `${percent}%`;
            }
            if (durationEl) {
              durationEl.textContent = `${this.formatDuration(videoEl.currentTime)} / ${originalDurationText}`;
            }
          };
          
          card.addEventListener('mouseenter', () => {
            if (!videoEl) {
              videoEl = document.createElement('video');
              videoEl.src = previewVideoEl.dataset.src;
              videoEl.preload = 'metadata';
              videoEl.muted = false;
              videoEl.volume = this.previewVolume;
              videoEl.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;';
              previewVideoEl.appendChild(videoEl);
              videoEl.addEventListener('timeupdate', updateProgress);
            }
            
            this.hoverTimeout = setTimeout(() => {
              if (videoEl) {
                videoEl.volume = this.previewVolume;
                videoEl.muted = false;
                videoEl.play().catch(() => {});
              }
            }, 300);
          });

          card.addEventListener('mouseleave', () => {
            clearTimeout(this.hoverTimeout);
            if (videoEl) {
              videoEl.pause();
              videoEl.currentTime = 0;
            }
            if (progressBar) {
              progressBar.style.width = '0%';
            }
            if (durationEl) {
              durationEl.textContent = originalDurationText;
            }
          });

          thumbnailEl.addEventListener('mousemove', (e) => {
            if (videoEl && videoEl.duration) {
              const rect = thumbnailEl.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const percent = x / rect.width;
              videoEl.currentTime = videoEl.duration * percent;
            }
          });
        }

        if (previewAudioEl) {
          let audioEl = null;

          card.addEventListener('mouseenter', () => {
            if (!audioEl) {
              audioEl = document.createElement('audio');
              audioEl.src = previewAudioEl.dataset.src;
              audioEl.preload = 'metadata';
              audioEl.volume = this.previewVolume;
              previewAudioEl.appendChild(audioEl);
            }
            
            this.hoverTimeout = setTimeout(() => {
              if (audioEl) {
                audioEl.volume = this.previewVolume;
                audioEl.muted = false;
                audioEl.play().catch(() => {});
              }
            }, 300);
          });

          card.addEventListener('mouseleave', () => {
            clearTimeout(this.hoverTimeout);
            if (audioEl) {
              audioEl.pause();
              audioEl.currentTime = 0;
            }
          });
        }
      }
    });

    // Pagination
    document.querySelectorAll('.pagination button[data-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const page = parseInt(btn.dataset.page, 10);
        this.refresh({ page });
      });
    });

    document.getElementById('pageSizeSelect')?.addEventListener('change', (e) => {
      this.refresh({ pageSize: parseInt(e.target.value, 10), page: 1 });
    });

    this.bindDetailPanelEvents();

    // Drop zone
    const dropZone = document.getElementById('dropZone');
    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
      });

      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
      });

      dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');

        const files = Array.from(e.dataTransfer.files);
        for (const file of files) {
          try {
            await api.uploadFile(store.currentLibrary.id, file, store.currentPath);
          } catch (err) {
            showToast(`上传失败: ${file.name}`, 'error');
          }
        }

        showToast(`已上传 ${files.length} 个文件`, 'success');
        setTimeout(() => this.refresh(), 1000);
      });
    }
  },

  async selectMedia(mediaId) {
    const cachedMedia = store.mediaList.find((m) => m.id === mediaId);
    if (cachedMedia) {
      this.updateSelection(cachedMedia);
    } else {
      try {
        const media = await api.getMediaDetail(mediaId);
        this.updateSelection(media);
      } catch (err) {
        console.error('Failed to get media detail:', err);
      }
    }
  },

  updateSelection(media) {
    const prevSelected = document.querySelector('.media-card.selected');
    if (prevSelected) {
      prevSelected.classList.remove('selected');
    }

    const newSelected = document.querySelector(`.media-card[data-id="${media.id}"]`);
    if (newSelected) {
      newSelected.classList.add('selected');
    }

    store.setSelectedMedia(media);
    this.updateDetailPanel(media);
  },

  updateDetailPanel(media) {
    const detailPanel = document.querySelector('.detail-panel');
    if (!detailPanel) return;

    const parent = detailPanel.parentElement;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = this.renderDetailPanel(media);
    const newPanel = tempDiv.firstElementChild;

    parent.replaceChild(newPanel, detailPanel);

    this.bindDetailPanelEvents();
  },

  bindDetailPanelEvents() {
    document.getElementById('closeDetail')?.addEventListener('click', () => {
      const prevSelected = document.querySelector('.media-card.selected');
      if (prevSelected) {
        prevSelected.classList.remove('selected');
      }
      store.setSelectedMedia(null);
      const detailPanel = document.querySelector('.detail-panel');
      if (detailPanel) {
        detailPanel.classList.remove('show');
        const parent = detailPanel.parentElement;
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = this.renderEmptyDetailPanel();
        parent.replaceChild(tempDiv.firstElementChild, detailPanel);
      }
    });

    document.querySelectorAll('.rating-star').forEach((star) => {
      star.addEventListener('click', async () => {
        if (!store.selectedMedia) return;
        const rating = parseInt(star.dataset.rating, 10);
        try {
          await api.setRating(store.selectedMedia.id, rating);
          store.selectedMedia.rating = rating;
          this.updateDetailPanel(store.selectedMedia);
          showToast('评分已保存', 'success');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    document.getElementById('addTagBtn')?.addEventListener('click', async () => {
      const input = document.getElementById('newTagInput');
      const tagName = input?.value?.trim();
      if (!tagName || !store.selectedMedia) return;

      try {
        await api.addTag(store.selectedMedia.id, tagName);
        const media = await api.getMediaDetail(store.selectedMedia.id);
        store.setSelectedMedia(media);
        this.updateDetailPanel(media);
        input.value = '';
        showToast('标签已添加', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    document.getElementById('newTagInput')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('addTagBtn')?.click();
      }
    });

    document.querySelectorAll('.tag .remove').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const tagIndex = parseInt(btn.dataset.tagIndex, 10);
        if (store.selectedMedia && store.selectedMedia.tags[tagIndex]) {
          try {
            const tags = await api.getTags(store.currentLibrary.id);
            const tag = tags.find(
              (t) => t.name === store.selectedMedia.tags[tagIndex]
            );
            if (tag) {
              await api.removeTag(store.selectedMedia.id, tag.id);
              const media = await api.getMediaDetail(store.selectedMedia.id);
              store.setSelectedMedia(media);
              this.updateDetailPanel(media);
            }
          } catch (err) {
            showToast(err.message, 'error');
          }
        }
      });
    });

    document.getElementById('deleteMediaBtn')?.addEventListener('click', async () => {
      if (!store.selectedMedia) return;
      if (!confirm('确定要删除这个文件吗？文件将被移到回收站。')) return;

      try {
        await api.deleteMedia(store.selectedMedia.id);
        store.setSelectedMedia(null);
        this.refresh();
        showToast('文件已删除', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  },

  async openPlayer(mediaId) {
    try {
      const mediaDetail = await api.getMediaDetail(mediaId);
      if (mediaDetail?.is_corrupted) {
        alert('此文件无法播放，请重新同步库以重试解析');
        return;
      }

      const currentPath = store.currentPath || '';
      const returnUrl = encodeURIComponent(
        window.location.pathname +
          '?libraryId=' +
          mediaDetail.library_id +
          (currentPath ? '&path=' + encodeURIComponent(currentPath) : '') +
          (store.flattenMode ? '&flatten=true' : '')
      );
      const playerUrl = new URL('/player.html', window.location.origin);
      playerUrl.searchParams.set('mediaId', mediaId);
      playerUrl.searchParams.set('libraryId', mediaDetail.library_id);
      playerUrl.searchParams.set('token', api.getToken());
      playerUrl.searchParams.set('returnUrl', returnUrl);
      playerUrl.searchParams.set('recursive', store.flattenMode ? 'true' : 'false');
      if (currentPath) {
        playerUrl.searchParams.set('path', currentPath);
      }
      window.location.href = playerUrl.href;
    } catch (err) {
      console.error('Failed to open player:', err);
    }
  },

  async refresh(params = {}) {
    if (!store.currentLibrary) return;

    await this.init(store.currentLibrary.id, {
      page: params.page || store.pagination.page,
      pageSize: params.pageSize || store.pagination.pageSize,
      type: store.filterType,
      tag: store.currentTag || '',
      search: store.searchQuery,
      path: params.path !== undefined ? params.path : store.currentPath,
    });

    this.render();
  },

  getFileIcon(type) {
    const icons = {
      video: '🎬',
      image: '🖼',
      audio: '🎵',
      other: '📄',
    };
    return icons[type] || icons.other;
  },

  formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  },

  formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unitIndex = 0;
    let size = bytes;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  },

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  updateUrl(libraryId, path) {
    const url = new URL(window.location.href);
    url.searchParams.set('libraryId', libraryId);
    if (path) {
      url.searchParams.set('path', path);
    } else {
      url.searchParams.delete('path');
    }
    window.history.pushState({}, '', url);
  },
};