const AuthPage = {
  isLogin: true,
  error: null,
  
  render() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="auth-container">
        <div class="auth-box">
          <h1>PeachBrowser</h1>
          <p class="subtitle">媒体文件管理与浏览</p>
          
          ${this.error ? `<div class="toast error" style="position:static;margin-bottom:20px;">${this.error}</div>` : ''}
          
          <form id="authForm">
            <div class="form-group">
              <label for="username">用户名</label>
              <input type="text" id="username" required minlength="3" placeholder="请输入用户名">
            </div>
            
            <div class="form-group">
              <label for="password">密码</label>
              <input type="password" id="password" required minlength="4" placeholder="请输入密码">
            </div>
            
            <button type="submit" class="btn btn-primary">
              ${this.isLogin ? '登录' : '注册'}
            </button>
          </form>
          
          <p class="auth-switch">
            ${this.isLogin ? '没有账号？' : '已有账号？'}
            <a id="switchAuth">${this.isLogin ? '立即注册' : '立即登录'}</a>
          </p>
        </div>
      </div>
    `;
    
    this.bindEvents();
  },
  
  bindEvents() {
    document.getElementById('authForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      
      try {
        this.error = null;
        let data;
        
        if (this.isLogin) {
          data = await api.login(username, password);
        } else {
          data = await api.register(username, password);
        }
        
        const user = await api.getCurrentUser();
        store.setUser({ id: user.id, username: user.username }, user.is_admin);
        window.dispatchEvent(new CustomEvent('auth-success'));
      } catch (err) {
        this.error = err.message;
        this.render();
      }
    });
    
    document.getElementById('switchAuth').addEventListener('click', () => {
      this.isLogin = !this.isLogin;
      this.error = null;
      this.render();
    });
  }
};
