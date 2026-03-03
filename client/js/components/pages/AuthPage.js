class AuthPage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      isLogin: true,
      error: null
    };
  }

  render() {
    const { isLogin, error } = this.state;
    
    return `
      <div class="auth-container">
        <div class="auth-box">
          <h1>PeachBrowser</h1>
          <p class="subtitle">媒体文件管理与浏览</p>
          
          ${error ? `<div class="toast error" style="position:static;margin-bottom:20px;">${escapeHtml(error)}</div>` : ''}
          
          <form class="auth-form">
            <div class="form-group">
              <label for="username">用户名</label>
              <input type="text" id="username" required minlength="3" placeholder="请输入用户名">
            </div>
            
            <div class="form-group">
              <label for="password">密码</label>
              <input type="password" id="password" required minlength="4" placeholder="请输入密码">
            </div>
            
            <button type="submit" class="btn btn-primary">
              ${isLogin ? '登录' : '注册'}
            </button>
          </form>
          
          <p class="auth-switch">
            ${isLogin ? '没有账号？' : '已有账号？'}
            <a class="switch-auth-link">${isLogin ? '立即注册' : '立即登录'}</a>
          </p>
        </div>
      </div>
    `;
  }

  bindEvents() {
    const form = this.$('.auth-form');
    const switchLink = this.$('.switch-auth-link');
    
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = this.$('#username')?.value?.trim();
      const password = this.$('#password')?.value;
      
      if (!username || !password) return;
      
      try {
        this.setState({ error: null });
        
        if (this.state.isLogin) {
          await api.login(username, password);
        } else {
          await api.register(username, password);
        }
        
        const user = await api.getCurrentUser();
        store.setUser({ id: user.id, username: user.username }, user.is_admin);
        
        window.dispatchEvent(new CustomEvent('auth-success'));
      } catch (err) {
        this.setState({ error: err.message });
      }
    });
    
    switchLink?.addEventListener('click', () => {
      this.setState({ isLogin: !this.state.isLogin, error: null });
    });
  }
}