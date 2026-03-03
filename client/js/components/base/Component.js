class Component {
  constructor(props = {}) {
    this.props = props;
    this.state = {};
    this.el = null;
    this._mounted = false;
  }

  setState(newState) {
    const prevState = { ...this.state };
    this.state = { ...this.state, ...newState };
    if (this._mounted && this.shouldUpdate(prevState, this.state)) {
      this.update();
    }
  }

  shouldUpdate(prevState, nextState) {
    return true;
  }

  render() {
    throw new Error('render() must be implemented');
  }

  mount(container) {
    if (typeof this.render === 'function') {
      const html = this.render();
      if (typeof html === 'string') {
        container.innerHTML = html;
        this.el = container.firstElementChild;
      } else if (html instanceof Node) {
        container.innerHTML = '';
        container.appendChild(html);
        this.el = html;
      }
    }
    this._mounted = true;
    this.bindEvents();
    this.onMount();
  }

  update() {
    if (!this.el || !this.el.parentElement) return;
    
    const parent = this.el.parentElement;
    const html = this.render();
    
    if (typeof html === 'string') {
      const temp = document.createElement('div');
      temp.innerHTML = html;
      const newEl = temp.firstElementChild;
      if (newEl) {
        parent.replaceChild(newEl, this.el);
        this.el = newEl;
      }
    }
    
    this.bindEvents();
  }

  bindEvents() {}

  onMount() {}

  unmount() {
    this._mounted = false;
    if (this.el && this.el.parentElement) {
      this.el.parentElement.removeChild(this.el);
    }
    this.el = null;
  }

  $(selector) {
    return this.el?.querySelector(selector);
  }

  $$(selector) {
    return this.el ? Array.from(this.el.querySelectorAll(selector)) : [];
  }
}