const DesktopPlayer = {
  videoElement: null,
  currentMedia: null,
  playlist: [],
  currentIndex: 0,
  previewCache: new Map(),
  previewDebounce: null,

  init(media, list, index) {
    this.currentMedia = media;
    this.playlist = list;
    this.currentIndex = index;
    this.render();
    this.renderPlaylist();
    this.renderDetails();
    this.setupKeyboardShortcuts();
    this.showShortcuts();
  },

  showShortcuts() {
    const shortcutsEl = document.getElementById('shortcuts');
    if (shortcutsEl) {
      shortcutsEl.classList.add('show');
      setTimeout(() => shortcutsEl.classList.remove('show'), 3000);
    }
  },

  render() {
    if (!this.currentMedia) return;

    const container = document.getElementById('videoContainer');
    const fileUrl = api.getFileUrl(this.currentMedia.library_id, this.currentMedia.relative_path);

    document.getElementById('playerTitle').textContent = this.currentMedia.filename;

    if (this.currentMedia.file_type === 'video') {
      container.innerHTML = `
        <div class="desktop-player-wrapper">
          <div class="desktop-video-container">
            <video id="mainVideo" src="${fileUrl}" autoplay>
              您的浏览器不支持视频播放
            </video>
          </div>
          <div class="desktop-controls">
            <div class="desktop-progress-wrapper">
              <div class="desktop-progress-container" id="desktopProgressContainer">
                <div class="desktop-progress-buffered" id="desktopProgressBuffered"></div>
                <div class="desktop-progress-bar" id="desktopProgressBar"></div>
              </div>
              <div class="desktop-preview-tooltip" id="desktopPreviewTooltip">
                <img id="desktopPreviewImg" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="">
                <div class="preview-time" id="desktopPreviewTime">0:00</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:12px;">
              <button id="playPauseBtn" style="background:none;border:none;color:white;font-size:18px;cursor:pointer;padding:4px 8px;">▶</button>
              <span id="desktopCurrentTime" style="color:white;font-size:13px;">0:00</span>
              <span style="color:rgba(255,255,255,0.6);font-size:13px;">/</span>
              <span id="desktopTotalTime" style="color:rgba(255,255,255,0.8);font-size:13px;">0:00</span>
              <div style="flex:1;"></div>
              <button id="fullscreenBtn" style="background:none;border:none;color:white;font-size:18px;cursor:pointer;padding:4px 8px;">⛶</button>
            </div>
          </div>
        </div>
      `;

      this.videoElement = document.getElementById('mainVideo');

      if (this.currentMedia.play_position) {
        this.videoElement.currentTime = this.currentMedia.play_position;
      }

      this.setupVideoEvents();
      this.setupControls();
    } else if (this.currentMedia.file_type === 'image') {
      container.innerHTML = `
        <img src="${fileUrl}" alt="${this.currentMedia.filename}">
      `;
      this.videoElement = null;
    } else if (this.currentMedia.file_type === 'audio') {
      container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;width:100%;">
          <div style="font-size:120px;margin-bottom:30px;">🎵</div>
          <div style="width:80%;max-width:800px;">
            <audio id="mainVideo" src="${fileUrl}" controls autoplay style="width:100%;"></audio>
          </div>
        </div>
      `;
      this.videoElement = document.getElementById('mainVideo');
      if (this.currentMedia.play_position) {
        this.videoElement.currentTime = this.currentMedia.play_position;
      }
      this.setupAudioEvents();
    } else {
      container.innerHTML = '<div style="color:white;padding:40px;">不支持预览此文件类型</div>';
      this.videoElement = null;
    }
  },

  setupVideoEvents() {
    if (!this.videoElement) return;

    this.videoElement.addEventListener('timeupdate', () => {
      if (this.videoElement.duration && Math.floor(this.videoElement.currentTime) % 5 === 0) {
        api.updatePlayProgress(this.currentMedia.id, this.videoElement.currentTime);
      }
      this.updateProgress();
    });

    this.videoElement.addEventListener('ended', () => {
      api.updatePlayProgress(this.currentMedia.id, this.videoElement.duration, true);
      this.playNext();
    });

    this.videoElement.addEventListener('loadedmetadata', () => {
      const totalEl = document.getElementById('desktopTotalTime');
      if (totalEl) totalEl.textContent = this.formatDuration(this.videoElement.duration);
    });
  },

  setupAudioEvents() {
    if (!this.videoElement) return;

    this.videoElement.addEventListener('timeupdate', () => {
      if (this.videoElement.duration && Math.floor(this.videoElement.currentTime) % 5 === 0) {
        api.updatePlayProgress(this.currentMedia.id, this.videoElement.currentTime);
      }
    });

    this.videoElement.addEventListener('ended', () => {
      api.updatePlayProgress(this.currentMedia.id, this.videoElement.duration, true);
      this.playNext();
    });
  },

  setupControls() {
    const progressContainer = document.getElementById('desktopProgressContainer');
    const tooltip = document.getElementById('desktopPreviewTooltip');
    const previewImg = document.getElementById('desktopPreviewImg');
    const previewTime = document.getElementById('desktopPreviewTime');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const fullscreenBtn = document.getElementById('fullscreenBtn');

    if (!progressContainer || !this.videoElement) return;

    progressContainer.addEventListener('click', (e) => {
      const rect = progressContainer.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      if (this.videoElement.duration) {
        this.videoElement.currentTime = percent * this.videoElement.duration;
      }
    });

    progressContainer.addEventListener('mouseenter', () => {
      if (tooltip) tooltip.style.opacity = '1';
    });

    progressContainer.addEventListener('mouseleave', () => {
      if (tooltip) tooltip.style.opacity = '0';
      if (this.previewDebounce) {
        clearTimeout(this.previewDebounce);
        this.previewDebounce = null;
      }
    });

    progressContainer.addEventListener('mousemove', (e) => {
      const rect = progressContainer.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const time = percent * (this.videoElement.duration || 0);

      if (tooltip) {
        const tooltipWidth = tooltip.offsetWidth;
        const mouseX = e.clientX - rect.left;
        let left = mouseX - tooltipWidth / 2;
        left = Math.max(0, Math.min(rect.width - tooltipWidth, left));
        tooltip.style.left = left + 'px';
      }

      if (previewTime) {
        previewTime.textContent = this.formatDuration(time);
      }

      if (this.previewDebounce) {
        clearTimeout(this.previewDebounce);
      }

      this.previewDebounce = setTimeout(() => {
        if (previewImg && this.currentMedia.file_type === 'video') {
          previewImg.classList.remove('loaded');
          const newSrc = this.getPreviewFrame(time);
          if (previewImg.src !== newSrc) {
            previewImg.src = newSrc;
          } else {
            previewImg.classList.add('loaded');
          }
        }
      }, 50);
    });

    if (previewImg) {
      previewImg.onload = () => {
        previewImg.classList.add('loaded');
      };
      previewImg.onerror = () => {
        previewImg.classList.remove('loaded');
      };
    }

    if (playPauseBtn) {
      playPauseBtn.addEventListener('click', () => {
        if (this.videoElement.paused) {
          this.videoElement.play();
          playPauseBtn.textContent = '⏸';
        } else {
          this.videoElement.pause();
          playPauseBtn.textContent = '▶';
        }
      });

      this.videoElement.addEventListener('play', () => {
        playPauseBtn.textContent = '⏸';
      });
      this.videoElement.addEventListener('pause', () => {
        playPauseBtn.textContent = '▶';
      });
    }

    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', () => {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          const wrapper = document.querySelector('.desktop-player-wrapper');
          if (wrapper) wrapper.requestFullscreen();
        }
      });
    }
  },

  getPreviewFrame(timeSeconds) {
    const roundedTime = Math.round(timeSeconds);
    const cacheKey = `${this.currentMedia.id}-${roundedTime}`;

    if (this.previewCache.has(cacheKey)) {
      return this.previewCache.get(cacheKey);
    }

    if (this.previewCache.size > 50) {
      const firstKey = this.previewCache.keys().next().value;
      this.previewCache.delete(firstKey);
    }

    const url = api.getPreviewFrameUrl(this.currentMedia.id, roundedTime);
    this.previewCache.set(cacheKey, url);
    return url;
  },

  updateProgress() {
    if (!this.videoElement) return;
    const duration = this.videoElement.duration || 0;
    const current = this.videoElement.currentTime || 0;
    const progress = duration ? (current / duration) * 100 : 0;

    const progressBar = document.getElementById('desktopProgressBar');
    if (progressBar) progressBar.style.width = progress + '%';

    const bufEl = document.getElementById('desktopProgressBuffered');
    if (bufEl && this.videoElement.buffered && this.videoElement.buffered.length) {
      try {
        const end = this.videoElement.buffered.end(this.videoElement.buffered.length - 1);
        const bufPct = duration ? (end / duration) * 100 : 0;
        bufEl.style.width = Math.min(100, bufPct) + '%';
      } catch {}
    }

    const currentEl = document.getElementById('desktopCurrentTime');
    if (currentEl) currentEl.textContent = this.formatDuration(current);
  },

  renderPlaylist() {
    const playlistEl = document.getElementById('playlist');
    if (!playlistEl) return;

    playlistEl.innerHTML = this.playlist.map((item, index) => `
      <div class="playlist-item ${index === this.currentIndex ? 'active' : ''}" data-index="${index}">
        <div class="playlist-item-thumb">
          ${item.thumbnailUrl
            ? `<img src="${item.thumbnailUrl}" alt="">`
            : `<div class="placeholder">${item.file_type === 'video' ? '🎬' : item.file_type === 'audio' ? '🎵' : '🖼'}</div>`}
        </div>
        <div class="playlist-item-info">
          <div class="playlist-item-title">${this.escapeHtml(item.filename)}</div>
          <div class="playlist-item-meta">${item.duration ? this.formatDuration(item.duration) : ''}</div>
        </div>
      </div>
    `).join('');

    playlistEl.querySelectorAll('.playlist-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        this.loadMedia(index);
      });
    });
  },

  renderDetails() {
    if (!this.currentMedia) return;

    const content = document.getElementById('detailsContent');
    if (!content) return;

    const ratingStars = [1, 2, 3, 4, 5].map(star => `
      <span class="rating-star ${star <= (this.currentMedia.rating || 0) ? 'active' : ''}" data-rating="${star}">★</span>
    `).join('');

    const likeClass = this.currentMedia.is_liked ? 'liked' : '';

    content.innerHTML = `
      <div class="detail-section">
        <h4>评分</h4>
        <div class="rating-input" id="ratingInput">${ratingStars}</div>
      </div>

      <div class="detail-section">
        <h4>收藏</h4>
        <button class="like-btn-detail ${likeClass}" id="detailLikeBtn">
          <span class="heart">♥</span> ${this.currentMedia.is_liked ? '已收藏' : '添加收藏'}
        </button>
      </div>

      <div class="detail-section">
        <h4>文件名</h4>
        <div class="value">${this.escapeHtml(this.currentMedia.filename)}</div>
      </div>

      ${this.currentMedia.width && this.currentMedia.height ? `
        <div class="detail-section">
          <h4>分辨率</h4>
          <div class="value">${this.currentMedia.width} × ${this.currentMedia.height}</div>
        </div>
      ` : ''}

      ${this.currentMedia.duration ? `
        <div class="detail-section">
          <h4>时长</h4>
          <div class="value">${this.formatDuration(this.currentMedia.duration)}</div>
        </div>
      ` : ''}

      ${this.currentMedia.codec ? `
        <div class="detail-section">
          <h4>编码</h4>
          <div class="value">${this.escapeHtml(this.currentMedia.codec)}</div>
        </div>
      ` : ''}

      ${this.currentMedia.file_size ? `
        <div class="detail-section">
          <h4>大小</h4>
          <div class="value">${this.formatFileSize(this.currentMedia.file_size)}</div>
        </div>
      ` : ''}

      <div class="detail-section">
        <h4>标签</h4>
        <div class="tag-list" id="tagList">
          ${(this.currentMedia.tags || []).map((tag, index) => `
            <span class="tag">
              ${this.escapeHtml(tag)}
              <span class="remove" data-tag-index="${index}">✕</span>
            </span>
          `).join('')}
        </div>
        <div class="add-tag-input">
          <input type="text" id="newTagInput" placeholder="添加标签...">
          <button class="btn btn-secondary btn-small" id="addTagBtn">添加</button>
        </div>
      </div>
    `;

    content.querySelectorAll('.rating-star').forEach(star => {
      star.addEventListener('click', async () => {
        const rating = parseInt(star.dataset.rating);
        try {
          await api.setRating(this.currentMedia.id, rating);
          this.currentMedia.rating = rating;
          this.renderDetails();
        } catch (err) {
          console.error('Failed to set rating:', err);
        }
      });
    });

    document.getElementById('detailLikeBtn')?.addEventListener('click', async () => {
      try {
        const result = await api.toggleLike(this.currentMedia.id);
        this.currentMedia.is_liked = result.liked;
        this.renderDetails();
      } catch (err) {
        console.error('Failed to toggle like:', err);
      }
    });

    document.getElementById('addTagBtn')?.addEventListener('click', async () => {
      const input = document.getElementById('newTagInput');
      const tagName = input?.value?.trim();
      if (!tagName) return;

      try {
        await api.addTag(this.currentMedia.id, tagName);
        const media = await api.getMediaDetail(this.currentMedia.id);
        this.currentMedia = media;
        this.renderDetails();
      } catch (err) {
        console.error('Failed to add tag:', err);
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
        if (this.currentMedia.tags && this.currentMedia.tags[tagIndex]) {
          try {
            const tags = await api.getTags(this.currentMedia.library_id);
            const tag = tags.find(t => t.name === this.currentMedia.tags[tagIndex]);
            if (tag) {
              await api.removeTag(this.currentMedia.id, tag.id);
              const media = await api.getMediaDetail(this.currentMedia.id);
              this.currentMedia = media;
              this.renderDetails();
            }
          } catch (err) {
            console.error('Failed to remove tag:', err);
          }
        }
      });
    });
  },

  loadMedia(index) {
    if (index < 0 || index >= this.playlist.length) return;
    this.currentIndex = index;
    this.currentMedia = this.playlist[this.currentIndex];
    const newUrl = new URL(window.location);
    newUrl.searchParams.set('mediaId', this.currentMedia.id);
    window.history.replaceState({}, '', newUrl);
    this.render();
    this.renderPlaylist();
    this.renderDetails();
  },

  playPrevious() {
    if (this.currentIndex > 0) {
      this.loadMedia(this.currentIndex - 1);
    }
  },

  playNext() {
    if (this.currentIndex < this.playlist.length - 1) {
      this.loadMedia(this.currentIndex + 1);
    }
  },

  setupKeyboardShortcuts() {
    this.keydownHandler = (e) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          this.playPrevious();
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.playNext();
          break;
        case 'ArrowLeft':
          if (this.videoElement) {
            e.preventDefault();
            this.videoElement.currentTime = Math.max(0, this.videoElement.currentTime - 5);
          }
          break;
        case 'ArrowRight':
          if (this.videoElement) {
            e.preventDefault();
            this.videoElement.currentTime = Math.min(this.videoElement.duration, this.videoElement.currentTime + 5);
          }
          break;
        case ' ':
          if (this.videoElement) {
            e.preventDefault();
            if (this.videoElement.paused) {
              this.videoElement.play();
            } else {
              this.videoElement.pause();
            }
          }
          break;
        case 'Escape':
          window.close();
          break;
      }
    };
    document.addEventListener('keydown', this.keydownHandler);
  },

  cleanup() {
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.removeAttribute('src');
      this.videoElement.load();
    }
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
    }
    this.previewCache.clear();
  },

  formatDuration(seconds) {
    const sNum = Number(seconds) || 0;
    const h = Math.floor(sNum / 3600);
    const m = Math.floor((sNum % 3600) / 60);
    const s = Math.floor(sNum % 60);
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
  }
};