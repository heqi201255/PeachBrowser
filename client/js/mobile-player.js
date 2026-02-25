const MobilePlayer = {
  videoElement: null,
  currentMedia: null,
  playlist: [],
  currentIndex: 0,
  currentVideoListeners: null,
  uiVisible: true,
  hideUiTimeout: null,
  isSeeking: false,
  seekStartX: 0,
  seekStartTime: 0,
  previewCache: new Map(),
  previewDebounceTimer: null,

  init(media, list, index) {
    this.currentMedia = media;
    this.playlist = list;
    this.currentIndex = index;
    this.render();
    this.bindEvents();
    this.setupTouchEvents();
    document.getElementById('playerTitle').textContent = media.filename;
  },

  render() {
    const mainEl = document.querySelector('.player-main');

    mainEl.innerHTML = `
      <div class="swipe-container" id="swipeContainer">
        <div class="swipe-item prev" id="swipeItemPrev"></div>
        <div class="swipe-item active" id="swipeItemCurrent"></div>
        <div class="swipe-item next" id="swipeItemNext"></div>
      </div>
      <div class="play-pause-overlay" id="playPauseOverlay"></div>
      <div class="seek-indicator left" id="seekLeft">-10s</div>
      <div class="seek-indicator right" id="seekRight">+10s</div>
      <div class="seek-preview" id="seekPreview">
        <img id="seekPreviewImg" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="">
        <div class="preview-time" id="seekPreviewTime">0:00</div>
      </div>
      <div class="video-overlay" id="videoOverlay">
        <div class="video-info">
          <h3 id="videoTitle">${this.escapeHtml(this.currentMedia.filename)}</h3>
        </div>
        <div class="time-display">
          <span id="currentTime">0:00</span>
          <span id="totalTime">0:00</span>
        </div>
        <div class="progress-bar-container" id="progressContainer">
          <div class="progress-bar-buffered" id="progressBuffered"></div>
          <div class="progress-bar" id="progressBar"></div>
        </div>
      </div>
      <div class="video-actions" id="videoActions">
        <div class="action-btn" id="prevVideoBtn">
          <div class="icon">↑</div>
          <span>上一个</span>
        </div>
        <div class="action-btn" id="fullscreenBtn">
          <div class="icon">⛶</div>
          <span>全屏</span>
        </div>
        <div class="action-btn" id="nextVideoBtn">
          <div class="icon">↓</div>
          <span>下一个</span>
        </div>
      </div>
    `;

    const currentEl = document.getElementById('swipeItemCurrent');
    const currentItem = this.playlist[this.currentIndex];
    if (currentItem) {
      const el = this.createMediaElement(currentItem, true, true);
      if (el) {
        currentEl.appendChild(el);
        const video = el.querySelector('video');
        if (video) this.setupCurrentVideo(video);
      }
    }
  },

  createMediaElement(item, autoplay = false, showThumbnail = false) {
    const container = document.createElement('div');
    container.style.position = 'relative';
    container.style.width = '100%';
    container.style.height = '100%';

    if (item.file_type === 'video') {
      if (showThumbnail && item.thumbnailUrl) {
        const thumbnail = document.createElement('img');
        thumbnail.className = 'swipe-item-thumbnail';
        thumbnail.src = item.thumbnailUrl;
        thumbnail.alt = item.filename;
        thumbnail.dataset.thumbnail = 'true';
        container.appendChild(thumbnail);
      }

      const video = document.createElement('video');
      video.src = api.getFileUrl(item.library_id, item.relative_path);
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.preload = autoplay ? 'auto' : 'metadata';
      video.muted = !autoplay;
      if (autoplay) {
        video.autoplay = true;
      }
      video.dataset.id = item.id;
      video.dataset.duration = item.duration || 0;

      if (video.readyState >= 1) {
        video.classList.add('loaded');
      }

      container.appendChild(video);
      return container;
    } else if (item.file_type === 'image') {
      const img = document.createElement('img');
      img.src = api.getFileUrl(item.library_id, item.relative_path);
      img.alt = item.filename;
      container.appendChild(img);
      return container;
    }
    return null;
  },

  cleanupVideo(element) {
    if (!element) return;

    const video = element.tagName === 'VIDEO' ? element : element.querySelector('video');
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
      if (video.parentNode) video.parentNode.removeChild(video);
    }

    if (element.tagName !== 'VIDEO') {
      while (element.firstChild) {
        const child = element.firstChild;
        if (child.tagName === 'VIDEO') {
          child.pause();
          child.removeAttribute('src');
          child.load();
        }
        element.removeChild(child);
      }
    }
  },

  cleanupSwipeItems() {
    const prevEl = document.getElementById('swipeItemPrev');
    const currentEl = document.getElementById('swipeItemCurrent');
    const nextEl = document.getElementById('swipeItemNext');

    [prevEl, currentEl, nextEl].forEach(el => {
      if (!el) return;
      Array.from(el.children).forEach(child => {
        this.cleanupVideo(child);
      });
      el.innerHTML = '';
    });
  },

  setupCurrentVideo(video) {
    if (!video || video.tagName !== 'VIDEO') return;

    this.videoElement = video;
    video.muted = false;
    video.preload = 'auto';
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    const hideThumbAndShowVideo = () => {
      const container = video.closest('.swipe-item');
      if (!container) return;
      const thumbnail = container.querySelector('.swipe-item-thumbnail');
      if (thumbnail) thumbnail.classList.add('hidden');
      video.classList.add('loaded');
    };

    const onTimeUpdate = (() => {
      let lastReported = -1;
      return () => {
        this.updateProgress();
        const t = Math.floor(video.currentTime || 0);
        if (t % 5 === 0 && t !== lastReported && this.currentMedia) {
          lastReported = t;
          api.updatePlayProgress(this.currentMedia.id, video.currentTime).catch(() => {});
        }
      };
    })();

    const onEnded = () => {
      if (this.currentMedia) {
        const done = video.duration || video.currentTime || 0;
        api.updatePlayProgress(this.currentMedia.id, done, true).catch(() => {});
      }
      if (this.currentIndex < this.playlist.length - 1) {
        this.swipeToNext();
      }
    };

    const onPlaying = () => {
      video.muted = false;
      this.preloadAdjacentVideos();
      hideThumbAndShowVideo();
    };

    const onLoadedMetadata = () => {
      this.updateProgress();
      const savedPosition = this.currentMedia?.play_position || 0;
      if (savedPosition > 0 && video.currentTime < 1) {
        video.currentTime = savedPosition;
      }
      hideThumbAndShowVideo();
      const totalEl = document.getElementById('totalTime');
      if (totalEl && isFinite(video.duration)) {
        totalEl.textContent = this.formatDuration(video.duration);
      }
    };

    const onLoadedData = hideThumbAndShowVideo;
    const onError = (e) => {
      console.error('Video load error:', e);
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('ended', onEnded);
    video.addEventListener('playing', onPlaying, { once: true });
    video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
    video.addEventListener('loadeddata', onLoadedData, { once: true });
    video.addEventListener('error', onError, { once: true });

    this.currentVideoListeners = {
      timeupdate: onTimeUpdate,
      ended: onEnded,
      loadedmetadata: onLoadedMetadata,
      loadeddata: onLoadedData,
      error: onError
    };

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        video.muted = true;
        video.play().catch(() => {});
      });
    }
    this.resetHideUiTimer();

    const seekPreviewImg = document.getElementById('seekPreviewImg');
    if (seekPreviewImg) {
      seekPreviewImg.onload = () => {
        seekPreviewImg.classList.add('loaded');
      };
      seekPreviewImg.onerror = () => {
        seekPreviewImg.classList.remove('loaded');
      };
    }
  },

  preloadAdjacentVideos() {
    const prevEl = document.getElementById('swipeItemPrev');
    const nextEl = document.getElementById('swipeItemNext');

    if (this.currentIndex > 0 && !prevEl.hasChildNodes()) {
      const prevItem = this.playlist[this.currentIndex - 1];
      const el = this.createMediaElement(prevItem, false, true);
      if (el) {
        prevEl.appendChild(el);
        const video = el.querySelector('video');
        if (video) {
          video.muted = true;
          video.preload = 'metadata';
          video.addEventListener('error', () => {
            console.warn('Failed to preload previous video');
          }, { once: true });
          setTimeout(() => {
            if (video.parentElement && prevEl.contains(video) && video.readyState === 0) {
              video.preload = 'auto';
            }
          }, 200);
        }
      }
    }

    if (this.currentIndex < this.playlist.length - 1 && !nextEl.hasChildNodes()) {
      const nextItem = this.playlist[this.currentIndex + 1];
      const el = this.createMediaElement(nextItem, false, true);
      if (el) {
        nextEl.appendChild(el);
        const video = el.querySelector('video');
        if (video) {
          video.muted = true;
          video.preload = 'metadata';
          video.addEventListener('error', () => {
            console.warn('Failed to preload next video');
          }, { once: true });
          setTimeout(() => {
            if (video.parentElement && nextEl.contains(video) && video.readyState === 0) {
              video.preload = 'auto';
            }
          }, 200);
        }
      }
    }
  },

  getPreviewFrame(mediaId, timeSeconds) {
    const roundedTime = Math.round(timeSeconds);
    const cacheKey = `${mediaId}-${roundedTime}`;

    if (this.previewCache.has(cacheKey)) {
      return Promise.resolve(this.previewCache.get(cacheKey));
    }

    if (this.previewCache.size > 50) {
      const firstKey = this.previewCache.keys().next().value;
      this.previewCache.delete(firstKey);
    }

    const url = api.getPreviewFrameUrl(mediaId, roundedTime);
    this.previewCache.set(cacheKey, url);
    return Promise.resolve(url);
  },

  showSeekPreview(timeSeconds) {
    if (!this.currentMedia || this.currentMedia.file_type !== 'video') return;

    const preview = document.getElementById('seekPreview');
    const previewImg = document.getElementById('seekPreviewImg');
    const previewTime = document.getElementById('seekPreviewTime');

    if (!preview || !previewImg) return;

    previewTime.textContent = this.formatDuration(timeSeconds);
    preview.classList.add('show');

    if (this.previewDebounceTimer) {
      clearTimeout(this.previewDebounceTimer);
    }

    this.previewDebounceTimer = setTimeout(() => {
      this.getPreviewFrame(this.currentMedia.id, timeSeconds).then(url => {
        previewImg.classList.remove('loaded');
        if (previewImg.src !== url) {
          previewImg.src = url;
        } else {
          previewImg.classList.add('loaded');
        }
      });
    }, 100);
  },

  hideSeekPreview() {
    const preview = document.getElementById('seekPreview');
    if (preview) {
      preview.classList.remove('show');
    }
    if (this.previewDebounceTimer) {
      clearTimeout(this.previewDebounceTimer);
      this.previewDebounceTimer = null;
    }
  },

  toggleUi() {
    this.uiVisible = !this.uiVisible;
    const header = document.querySelector('.player-header');
    const overlay = document.getElementById('videoOverlay');
    const actions = document.getElementById('videoActions');

    header?.classList.toggle('hidden', !this.uiVisible);
    overlay?.classList.toggle('hidden', !this.uiVisible);
    actions?.classList.toggle('hidden', !this.uiVisible);

    if (this.uiVisible && this.videoElement && !this.videoElement.paused) {
      this.resetHideUiTimer();
    }
  },

  showUi() {
    this.uiVisible = true;
    const header = document.querySelector('.player-header');
    const overlay = document.getElementById('videoOverlay');
    const actions = document.getElementById('videoActions');

    header?.classList.remove('hidden');
    overlay?.classList.remove('hidden');
    actions?.classList.remove('hidden');
  },

  hideUi() {
    this.uiVisible = false;
    const header = document.querySelector('.player-header');
    const overlay = document.getElementById('videoOverlay');
    const actions = document.getElementById('videoActions');

    header?.classList.add('hidden');
    overlay?.classList.add('hidden');
    actions?.classList.add('hidden');
  },

  resetHideUiTimer() {
    if (this.hideUiTimeout) clearTimeout(this.hideUiTimeout);
    if (this.videoElement && !this.videoElement.paused) {
      this.hideUiTimeout = setTimeout(() => this.hideUi(), 3000);
    }
  },

  showPlayPauseIndicator(playing) {
    const overlay = document.getElementById('playPauseOverlay');
    overlay.textContent = playing ? '⏸' : '▶';
    overlay.classList.add('show');
    setTimeout(() => overlay.classList.remove('show'), 500);
  },

  updateProgress() {
    if (!this.videoElement) return;
    const duration = this.videoElement.duration || 0;
    const current = this.videoElement.currentTime || 0;
    const progress = duration ? (current / duration) * 100 : 0;
    const progressBar = document.getElementById('progressBar');
    if (progressBar) progressBar.style.width = progress + '%';

    const bufEl = document.getElementById('progressBuffered');
    if (bufEl && this.videoElement.buffered && this.videoElement.buffered.length) {
      try {
        const end = this.videoElement.buffered.end(this.videoElement.buffered.length - 1);
        const bufPct = duration ? (end / duration) * 100 : 0;
        bufEl.style.width = Math.min(100, bufPct) + '%';
      } catch {}
    }

    const currentEl = document.getElementById('currentTime');
    const totalEl = document.getElementById('totalTime');
    if (currentEl) currentEl.textContent = this.formatDuration(current);
    if (totalEl && isFinite(duration)) totalEl.textContent = this.formatDuration(duration);
  },

  bindEvents() {
    const container = document.getElementById('swipeContainer');

    container?.addEventListener('click', (e) => {
      if (this.isSeeking) return;
      const activeItem = document.querySelector('.swipe-item.active');
      const video = activeItem?.querySelector('video');
      if (video && video.readyState >= 2) {
        if (video.paused) {
          video.play();
          this.resetHideUiTimer();
          this.showUi();
          this.showPlayPauseIndicator(true);
        } else {
          video.pause();
          if (this.hideUiTimeout) clearTimeout(this.hideUiTimeout);
          this.showUi();
          this.showPlayPauseIndicator(false);
        }
      }
    });

    document.getElementById('prevVideoBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.swipeToPrev();
    });

    document.getElementById('nextVideoBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.swipeToNext();
    });

    document.getElementById('fullscreenBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const video = document.querySelector('.swipe-item.active video');
      if (video) {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          video.requestFullscreen();
        }
      }
    });

    const progressContainer = document.getElementById('progressContainer');
    progressContainer?.addEventListener('click', (e) => {
      e.stopPropagation();
      const activeItem = document.querySelector('.swipe-item.active');
      const video = activeItem?.querySelector('video');
      if (video && video.duration && video.readyState >= 2) {
        const rect = progressContainer.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        video.currentTime = Math.max(0, Math.min(video.duration, percent * video.duration));
      }
    });
  },

  setupTouchEvents() {
    const container = document.getElementById('swipeContainer');
    if (!container) return;

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let gestureMode = null;
    const self = this;

    container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        startTime = Date.now();
        gestureMode = null;

        const currentEl = document.getElementById('swipeItemCurrent');
        const prevEl = document.getElementById('swipeItemPrev');
        const nextEl = document.getElementById('swipeItemNext');
        currentEl.style.transition = '';
        prevEl.style.transition = '';
        nextEl.style.transition = '';

        self.preloadAdjacentVideos();
      }
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) {
        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const deltaX = currentX - startX;
        const deltaY = currentY - startY;
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        if (!gestureMode && (absX > 15 || absY > 15)) {
          gestureMode = absY > absX ? 'vertical' : 'horizontal';
        }

        if (gestureMode === 'vertical') {
          const currentEl = document.getElementById('swipeItemCurrent');
          const prevEl = document.getElementById('swipeItemPrev');
          const nextEl = document.getElementById('swipeItemNext');

          if (deltaY < 0 && self.currentIndex < self.playlist.length - 1) {
            e.preventDefault();
            currentEl.style.transform = `translateY(${deltaY}px)`;
            nextEl.style.transform = `translateY(calc(100% + ${deltaY}px))`;
            prevEl.style.transform = 'translateY(-100%)';

            const nextVideo = nextEl.querySelector('video');
            if (nextVideo && nextVideo.readyState === 0) {
              nextVideo.preload = 'auto';
            }
          } else if (deltaY > 0 && self.currentIndex > 0) {
            e.preventDefault();
            currentEl.style.transform = `translateY(${deltaY}px)`;
            prevEl.style.transform = `translateY(calc(-100% + ${deltaY}px))`;
            nextEl.style.transform = 'translateY(100%)';

            const prevVideo = prevEl.querySelector('video');
            if (prevVideo && prevVideo.readyState === 0) {
              prevVideo.preload = 'auto';
            }
          }
        } else if (gestureMode === 'horizontal') {
          if (self.videoElement && self.videoElement.duration) {
            e.preventDefault();
            if (!self.isSeeking) {
              self.isSeeking = true;
              self.seekStartX = currentX;
              self.seekStartTime = self.videoElement.currentTime;
            }

            const rawDelta = currentX - self.seekStartX;
            const maxSeekDistance = self.videoElement.duration * 0.5;
            const normalizedDelta = rawDelta / (window.innerWidth / 2);
            const seekDelta = Math.sign(normalizedDelta) * Math.pow(Math.abs(normalizedDelta), 0.35) * maxSeekDistance;
            const newTime = Math.max(0, Math.min(self.videoElement.duration, self.seekStartTime + seekDelta));
            self.videoElement.currentTime = newTime;

            self.showSeekPreview(newTime);

            const seekLeft = document.getElementById('seekLeft');
            const seekRight = document.getElementById('seekRight');
            const diff = newTime - self.seekStartTime;

            if (diff < -1) {
              seekLeft.textContent = Math.round(-diff) + 's';
              seekLeft.classList.add('show');
              seekRight.classList.remove('show');
            } else if (diff > 1) {
              seekRight.textContent = '+' + Math.round(diff) + 's';
              seekRight.classList.add('show');
              seekLeft.classList.remove('show');
            }
          }
        }
      }
    }, { passive: false });

    container.addEventListener('touchend', (e) => {
      const currentEl = document.getElementById('swipeItemCurrent');
      const prevEl = document.getElementById('swipeItemPrev');
      const nextEl = document.getElementById('swipeItemNext');

      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const deltaX = endX - startX;
      const deltaY = endY - startY;
      const deltaTime = Date.now() - startTime;

      if (self.isSeeking) {
        self.isSeeking = false;
        document.getElementById('seekLeft')?.classList.remove('show');
        document.getElementById('seekRight')?.classList.remove('show');
        self.hideSeekPreview();
        gestureMode = null;
        return;
      }

      if (gestureMode === 'vertical') {
        currentEl.style.transition = 'transform 0.2s ease-out';
        prevEl.style.transition = 'transform 0.2s ease-out';
        nextEl.style.transition = 'transform 0.2s ease-out';

        const threshold = window.innerHeight * 0.2;
        const shouldSwitch = Math.abs(deltaY) > threshold ||
          (Math.abs(deltaY) > 60 && deltaTime < 250);

        if (shouldSwitch) {
          if (deltaY < 0 && self.currentIndex < self.playlist.length - 1) {
            currentEl.style.transform = 'translateY(-100%)';
            nextEl.style.transform = 'translateY(0)';
            setTimeout(() => {
              self.switchToVideo('next');
            }, 200);
          } else if (deltaY > 0 && self.currentIndex > 0) {
            currentEl.style.transform = 'translateY(100%)';
            prevEl.style.transform = 'translateY(0)';
            setTimeout(() => {
              self.switchToVideo('prev');
            }, 200);
          } else {
            resetSwipePosition();
          }
        } else {
          resetSwipePosition();
        }
      }

      gestureMode = null;
    }, { passive: true });

    function resetSwipePosition() {
      const currentEl = document.getElementById('swipeItemCurrent');
      const prevEl = document.getElementById('swipeItemPrev');
      const nextEl = document.getElementById('swipeItemNext');

      currentEl.style.transform = '';
      prevEl.style.transform = 'translateY(-100%)';
      nextEl.style.transform = 'translateY(100%)';

      setTimeout(() => {
        currentEl.style.transition = '';
        prevEl.style.transition = '';
        nextEl.style.transition = '';
      }, 200);
    }
  },

  switchToVideo(direction) {
    const prevEl = document.getElementById('swipeItemPrev');
    const currentEl = document.getElementById('swipeItemCurrent');
    const nextEl = document.getElementById('swipeItemNext');

    if (this.currentVideoListeners && this.videoElement) {
      this.videoElement.removeEventListener('timeupdate', this.currentVideoListeners.timeupdate);
      this.videoElement.removeEventListener('ended', this.currentVideoListeners.ended);
      this.videoElement.removeEventListener('loadedmetadata', this.currentVideoListeners.loadedmetadata);
      this.videoElement.removeEventListener('loadeddata', this.currentVideoListeners.loadeddata);
      this.videoElement.removeEventListener('error', this.currentVideoListeners.error);
    }
    this.currentVideoListeners = null;
    this.videoElement = null;

    Array.from(currentEl.children).forEach(child => this.cleanupVideo(child));
    currentEl.innerHTML = '';

    this.currentIndex += (direction === 'next' ? 1 : -1);
    this.currentMedia = this.playlist[this.currentIndex];

    const newUrl = new URL(window.location);
    newUrl.searchParams.set('mediaId', this.currentMedia.id);
    window.history.replaceState({}, '', newUrl);

    document.getElementById('videoTitle').textContent = this.currentMedia.filename;

    const sourceEl = (direction === 'next' ? nextEl : prevEl);
    const otherEl = (direction === 'next' ? prevEl : nextEl);

    const nodeToMove = sourceEl.firstElementChild;
    if (nodeToMove) {
      currentEl.appendChild(nodeToMove);
      sourceEl.innerHTML = '';
    } else {
      const el = this.createMediaElement(this.currentMedia, true, true);
      if (el) currentEl.appendChild(el);
    }

    currentEl.className = 'swipe-item active';
    prevEl.className = 'swipe-item prev';
    nextEl.className = 'swipe-item next';

    prevEl.style.transition = '';
    prevEl.style.transform = 'translateY(-100%)';
    nextEl.style.transition = '';
    nextEl.style.transform = 'translateY(100%)';
    currentEl.style.transition = '';
    currentEl.style.transform = '';

    const newVideo = currentEl.querySelector('video');
    if (newVideo) {
      newVideo.preload = 'auto';
      newVideo.muted = false;
      if (newVideo.readyState >= 1) {
        const thumbnail = currentEl.querySelector('.swipe-item-thumbnail');
        if (thumbnail) thumbnail.classList.add('hidden');
        newVideo.classList.add('loaded');
      }
      this.setupCurrentVideo(newVideo);
    } else {
      const el = this.createMediaElement(this.currentMedia, true, true);
      if (el) {
        currentEl.appendChild(el);
        const v = el.querySelector('video');
        if (v) this.setupCurrentVideo(v);
      }
    }

    setTimeout(() => {
      Array.from(otherEl.children).forEach(child => {
        this.cleanupVideo(child);
      });
      otherEl.innerHTML = '';

      const preloadItem = (direction === 'next')
        ? (this.currentIndex > 0 ? this.playlist[this.currentIndex - 1] : null)
        : (this.currentIndex < this.playlist.length - 1 ? this.playlist[this.currentIndex + 1] : null);

      if (preloadItem && !otherEl.hasChildNodes()) {
        const el = this.createMediaElement(preloadItem, false, true);
        if (el) {
          otherEl.appendChild(el);
          const v = el.querySelector('video');
          if (v) {
            v.muted = true;
            v.preload = 'metadata';
            v.addEventListener('error', () => {
              console.warn('Video preload failed, skipping');
            }, { once: true });
          }
        }
      }
    }, 300);
  },

  swipeToNext() {
    if (this.currentIndex < this.playlist.length - 1) {
      const currentEl = document.getElementById('swipeItemCurrent');
      const nextEl = document.getElementById('swipeItemNext');

      currentEl.style.transition = 'transform 0.2s ease-out';
      nextEl.style.transition = 'transform 0.2s ease-out';

      currentEl.style.transform = 'translateY(-100%)';
      nextEl.style.transform = 'translateY(0)';

      setTimeout(() => {
        this.switchToVideo('next');
      }, 200);
    }
  },

  swipeToPrev() {
    if (this.currentIndex > 0) {
      const prevEl = document.getElementById('swipeItemPrev');
      const currentEl = document.getElementById('swipeItemCurrent');

      currentEl.style.transition = 'transform 0.2s ease-out';
      prevEl.style.transition = 'transform 0.2s ease-out';

      currentEl.style.transform = 'translateY(100%)';
      prevEl.style.transform = 'translateY(0)';

      setTimeout(() => {
        this.switchToVideo('prev');
      }, 200);
    }
  },

  cleanup() {
    this.cleanupSwipeItems();
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.removeAttribute('src');
      this.videoElement.load();
    }
    if (this.hideUiTimeout) {
      clearTimeout(this.hideUiTimeout);
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

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};