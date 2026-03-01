const { escapeHtml } = require('../../utils/format');

class MediaDetail extends Component {
  constructor(props) {
    super(props);
    this.state = {
      media: props.media || null
    };
  }

  render() {
    const { media } = this.state;
    
    if (!media) {
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
    }
    
    const ratingStars = [1, 2, 3, 4, 5]
      .map(star => `
        <span class="rating-star ${star <= (media.rating || 0) ? 'active' : ''}" data-rating="${star}">★</span>
      `).join('');
    
    const likeClass = media.is_liked ? 'liked' : '';
    
    return `
      <div class="detail-panel show">
        <div class="detail-panel-header">
          <h3>文件详情</h3>
          <button class="btn-icon close-detail-btn">✕</button>
        </div>
        <div class="detail-panel-content">
          <div class="detail-section">
            <h4>评分</h4>
            <div class="rating-input">${ratingStars}</div>
          </div>
          
          <div class="detail-section">
            <h4>收藏</h4>
            <button class="like-btn-detail ${likeClass}" id="detailLikeBtn">
              <span class="heart">♥</span> ${media.is_liked ? '已收藏' : '添加收藏'}
            </button>
          </div>
          
          <div class="detail-section">
            <h4>文件名</h4>
            <div class="value">${escapeHtml(media.filename)}</div>
          </div>
          
          <div class="detail-section">
            <h4>路径</h4>
            <div class="value" style="font-size:12px;word-break:break-all;">${escapeHtml(media.relative_path)}</div>
          </div>
          
          ${media.width && media.height ? `
            <div class="detail-section">
              <h4>分辨率</h4>
              <div class="value">${media.width} × ${media.height}</div>
            </div>
          ` : ''}
          
          ${media.duration ? `
            <div class="detail-section">
              <h4>时长</h4>
              <div class="value">${formatDuration(media.duration)}</div>
            </div>
          ` : ''}
          
          ${media.fps ? `
            <div class="detail-section">
              <h4>帧率</h4>
              <div class="value">${media.fps.toFixed(2)} fps</div>
            </div>
          ` : ''}
          
          ${media.bitrate ? `
            <div class="detail-section">
              <h4>比特率</h4>
              <div class="value">${(media.bitrate / 1000).toFixed(0)} kbps</div>
            </div>
          ` : ''}
          
          ${media.codec ? `
            <div class="detail-section">
              <h4>编码</h4>
              <div class="value">${escapeHtml(media.codec)}</div>
            </div>
          ` : ''}
          
          ${media.file_size ? `
            <div class="detail-section">
              <h4>文件大小</h4>
              <div class="value">${formatFileSize(media.file_size)}</div>
            </div>
          ` : ''}
          
          <div class="detail-section">
            <h4>标签</h4>
            <div class="tag-list">
              ${(media.tags || []).map((tag, index) => `
                <span class="tag">
                  ${escapeHtml(tag)}
                  <span class="remove" data-tag-index="${index}">✕</span>
                </span>
              `).join('')}
            </div>
            <div class="add-tag-input">
              <input type="text" class="new-tag-input" placeholder="添加标签...">
              <button class="btn btn-secondary btn-small add-tag-btn">添加</button>
            </div>
          </div>
          
          <div class="detail-section">
            <button class="btn btn-danger delete-media-btn" style="width:100%;">删除文件</button>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    this.$('.close-detail-btn')?.addEventListener('click', () => {
      if (this.props.onClose) this.props.onClose();
    });
    
    this.$$('.rating-star').forEach(star => {
      star.addEventListener('click', () => {
        const rating = parseInt(star.dataset.rating, 10);
        if (this.props.onRating) this.props.onRating(rating);
      });
    });
    
    this.$('#detailLikeBtn')?.addEventListener('click', () => {
      if (this.props.onLikeToggle) this.props.onLikeToggle();
    });
    
    this.$('.add-tag-btn')?.addEventListener('click', () => {
      const input = this.$('.new-tag-input');
      const tagName = input?.value?.trim();
      if (tagName && this.props.onAddTag) {
        this.props.onAddTag(tagName);
        input.value = '';
      }
    });
    
    this.$('.new-tag-input')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.$('.add-tag-btn')?.click();
      }
    });
    
    this.$$('.tag .remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.tagIndex, 10);
        if (this.props.onRemoveTag) this.props.onRemoveTag(index);
      });
    });
    
    this.$('.delete-media-btn')?.addEventListener('click', () => {
      if (this.props.onDelete) this.props.onDelete();
    });
  }

  setMedia(media) {
    this.setState({ media });
  }
}

function formatDuration(seconds) {
  const sNum = Number(seconds) || 0;
  const h = Math.floor(sNum / 3600);
  const m = Math.floor((sNum % 3600) / 60);
  const s = Math.floor(sNum % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let size = bytes;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

module.exports = MediaDetail;