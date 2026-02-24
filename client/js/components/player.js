const PlayerModal = {
  video: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  
  render(media) {
    const fileUrl = api.getFileUrl(media.library_id, media.relative_path);
    
    let contentHtml = '';
    
    if (media.file_type === 'video') {
      contentHtml = `
        <video class="player-video" id="playerVideo" src="${fileUrl}" controls autoplay>
          您的浏览器不支持视频播放
        </video>
      `;
    } else if (media.file_type === 'image') {
      contentHtml = `
        <img class="player-video" src="${fileUrl}" alt="${media.filename}" style="object-fit:contain;">
      `;
    } else if (media.file_type === 'audio') {
      contentHtml = `
        <div style="text-align:center;padding:60px;">
          <div style="font-size:100px;margin-bottom:20px;">🎵</div>
          <audio id="playerVideo" src="${fileUrl}" controls autoplay style="width:100%;max-width:400px;"></audio>
        </div>
      `;
    } else {
      contentHtml = `
        <div style="text-align:center;padding:60px;">
          <div style="font-size:100px;margin-bottom:20px;">📄</div>
          <p>不支持预览此文件类型</p>
        </div>
      `;
    }
    
    return `
      <div class="player-overlay" id="playerOverlay">
        <button class="btn-icon" id="closePlayer" style="position:absolute;top:20px;right:20px;font-size:24px;color:white;">
          ✕
        </button>
        
        <div class="player-container">
          ${contentHtml}
          
          <div class="player-info">
            <h2>${this.escapeHtml(media.filename)}</h2>
            <div class="meta">
              ${media.width && media.height ? `<span>${media.width} × ${media.height}</span>` : ''}
              ${media.duration ? `<span> • ${BrowserPage.formatDuration(media.duration)}</span>` : ''}
              ${media.file_size ? `<span> • ${BrowserPage.formatFileSize(media.file_size)}</span>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  },
  
  bindEvents() {
    document.getElementById('closePlayer')?.addEventListener('click', () => {
      this.close();
    });
    
    document.getElementById('playerOverlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'playerOverlay') {
        this.close();
      }
    });
    
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.close();
      }
    });
    
    const video = document.getElementById('playerVideo');
    if (video && video.tagName === 'VIDEO') {
      video.addEventListener('timeupdate', async () => {
        if (video.duration && Math.floor(video.currentTime) % 5 === 0) {
          try {
            await api.updatePlayProgress(BrowserPage.currentMedia.id, video.currentTime);
          } catch (err) {}
        }
      });
      
      video.addEventListener('ended', async () => {
        try {
          await api.updatePlayProgress(BrowserPage.currentMedia.id, video.duration, true);
        } catch (err) {}
      });
      
      if (BrowserPage.currentMedia?.play_position) {
        video.currentTime = BrowserPage.currentMedia.play_position;
      }
    }
  },
  
  close() {
    const video = document.getElementById('playerVideo');
    if (video) {
      video.pause();
    }
    BrowserPage.closePlayer();
  },
  
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};
