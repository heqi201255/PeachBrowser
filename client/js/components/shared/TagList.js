class TagList extends Component {
  constructor(props) {
    super(props);
    this.state = {
      tags: props.tags || []
    };
  }

  render() {
    const { tags } = this.state;
    const { editable = true } = this.props;

    return `
      <div class="tag-list">
        ${tags.map((tag, index) => `
          <span class="tag">
            ${escapeHtml(tag)}
            ${editable ? `<span class="remove" data-tag-index="${index}">✕</span>` : ''}
          </span>
        `).join('')}
      </div>
      ${editable ? `
        <div class="add-tag-input">
          <input type="text" class="new-tag-input" placeholder="添加标签...">
          <button class="btn btn-secondary btn-small add-tag-btn">添加</button>
        </div>
      ` : ''}
    `;
  }

  bindEvents() {
    this.$$('.tag .remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.tagIndex, 10);
        this.removeTag(index);
      });
    });

    const input = this.$('.new-tag-input');
    const addBtn = this.$('.add-tag-btn');

    if (input && addBtn) {
      addBtn.addEventListener('click', () => {
        const tagName = input.value.trim();
        if (tagName) {
          this.addTag(tagName);
          input.value = '';
        }
      });

      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          addBtn.click();
        }
      });
    }
  }

  addTag(tagName) {
    const tags = [...this.state.tags, tagName];
    this.setState({ tags });
    if (this.props.onAdd) {
      this.props.onAdd(tagName);
    }
  }

  removeTag(index) {
    const tag = this.state.tags[index];
    const tags = this.state.tags.filter((_, i) => i !== index);
    this.setState({ tags });
    if (this.props.onRemove) {
      this.props.onRemove(index, tag);
    }
  }

  setTags(tags) {
    this.setState({ tags });
  }
}