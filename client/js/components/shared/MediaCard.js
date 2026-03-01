const { escapeHtml, formatDuration, formatFileSize, getFileIcon } = require('../../utils/format');

class MediaCard extends Component {
  constructor(props) {
    super(props);
    this.state = {
      is_liked: props.media?.is_liked || false
    };
  }

  render() {
    const { media, isSelected, token } = this.props;
    const { is_liked } = this.state;
    
    if (!media) return '';
    
    const isGif = media.extension?.toLowerCase() === '.gif';
    const isAudio = media.file_type === 'audio';
    const isVideo = media.file_type === 'video';
    
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
    
    const progressHtml = isVideo
      ? `<div class="preview-progress"><div class="progress-bar"></div></div>`
      : '';
    
    const typeBadgeHtml = `<span class="type-badge">${media.file_type}</span>`;
    const corruptedBadgeHtml = media.is_corrupted
      ? `<span class="corrupted-badge" title="文件解析失败">⚠️</span>`
      : '';
    
    const ratingHtml = media.rating > 0
      ? `<div class="rating-stars">${'★'.repeat(media.rating)}${'☆'.repeat(5 - media.rating)}</div>`
      : '';
    
    return `
      <div class="media-card ${isSelected ? 'selected' : ''} ${media.is_corrupted ? 'corrupted' : ''}" data-id="${media.id}">
        <div class="media-thumbnail" data-path="${media.relative_path}" data-preview="${isVideo ? 'video' : isAudio ? 'audio' : ''}">
          ${thumbnailHtml}
          ${typeBadgeHtml}
          ${corruptedBadgeHtml}
          ${durationHtml}
          ${progressHtml}
          <button class="like-btn ${is_liked ? 'liked' : ''}" data-id="${media.id}" title="收藏">♥</button>
        </div>
        <div class="media-info">
          <h4 title="${escapeHtml(media.filename)}">${escapeHtml(media.filename)}</h4>
          <div class="meta">
            ${media.width && media.height ? `${media.width}×${media.height}` : ''}
            ${media.play_count ? `• 播放${media.play_count}次` : ''}
          </div>
          ${ratingHtml}
        </div>
      </div>
    `;
  }

  bindEvents() {
    const likeBtn = this.$('.like-btn');
    if (likeBtn) {
      likeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleLike();
      });
    }
  }

  toggleLike() {
    const newLiked = !this.state.is_liked;
    this.setState({ is_liked: newLiked });
    if (this.props.onLikeToggle) {
      this.props.onLikeToggle(this.props.media.id, newLiked);
    }
  }

  setLiked(is_liked) {
    this.setState({ is_liked });
  }
}

module.exports = MediaCard;