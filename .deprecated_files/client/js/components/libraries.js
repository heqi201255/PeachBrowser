const LibrariesPage = {
  showAddModal: false,
  showUserManageModal: false,
  showChangePasswordModal: false,
  newLibraryName: '',
  newLibraryPath: '',
  users: [],
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
  
  async init() {
    try {
      const libraries = await api.getLibraries();
      store.setLibraries(libraries);
    } catch (err) {
      console.error('Failed to load libraries:', err);
    }
  },
  
  render() {
    const app = document.getElementById('app');
    const { libraries, isAdmin } = store;
    
    app.innerHTML = `
      <div class="app-layout">
        <aside class="sidebar">
          <div class="sidebar-header">
            <h2>PeachBrowser</h2>
          </div>
          <div class="sidebar-section">
            <h3>导航</h3>
            <ul class="sidebar-nav">
              <li class="active">
                <span>📚</span> 媒体库
              </li>
            </ul>
          </div>
        </aside>
        
        <main class="main-content">
          <header class="header">
            <h1>媒体库</h1>
            <div class="header-actions">
              <div class="user-menu">
                <button class="user-menu-btn" id="userMenuBtn">
                  <span>👤</span>
                  <span>${store.user?.username || 'User'}${isAdmin ? ' (管理员)' : ''}</span>
                </button>
                <div class="user-menu-dropdown" id="userMenuDropdown">
                  ${isAdmin ? '<button id="userManageBtn">用户管理</button>' : ''}
                  <button id="changePasswordBtn">修改密码</button>
                  <button id="logoutBtn">退出登录</button>
                </div>
              </div>
            </div>
          </header>
          
          <div class="content">
            ${libraries.length === 0 ? `
              <div class="empty-state">
                <div class="icon">📁</div>
                <h3>还没有媒体库</h3>
                <p>${isAdmin ? '点击右下角按钮添加你的第一个媒体库' : '请联系管理员添加媒体库'}</p>
              </div>
            ` : `
              <div class="libraries-grid">
                ${libraries.map(lib => `
                  <div class="library-card" data-id="${lib.id}">
                    <h3>
                      <span>📁</span>
                      ${this.escapeHtml(lib.name)}
                    </h3>
                    <p class="path">${this.escapeHtml(lib.path)}</p>
                    <div class="meta">
                      <span>ID: ${lib.id}</span>
                    </div>
                    ${isAdmin ? `
                      <div class="actions">
                        <button class="btn btn-secondary btn-small rescan-btn" data-id="${lib.id}">重新扫描</button>
                        <button class="btn btn-danger btn-small delete-btn" data-id="${lib.id}">删除</button>
                      </div>
                    ` : ''}
                  </div>
                `).join('')}
              </div>
            `}
            
            ${isAdmin ? `
              <button class="btn btn-primary" id="addLibraryBtn" style="position:fixed;bottom:24px;right:24px;">
                + 添加媒体库
              </button>
            ` : ''}
          </div>
        </main>
      </div>
      
      ${this.showAddModal ? this.renderAddModal() : ''}
      ${this.showUserManageModal ? this.renderUserManageModal() : ''}
      ${this.showChangePasswordModal ? this.renderChangePasswordModal() : ''}
    `;
    
    this.bindEvents();
  },
  
  renderAddModal() {
    return `
      <div class="modal-overlay" id="addModal">
        <div class="modal">
          <div class="modal-header">
            <h2>添加媒体库</h2>
            <button class="btn-icon" id="closeModal">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label for="libraryName">媒体库名称</label>
              <input type="text" id="libraryName" value="${this.newLibraryName}" placeholder="例如：我的视频库">
            </div>
            <div class="form-group">
              <label for="libraryPath">文件夹路径</label>
              <div class="folder-picker">
                <input type="text" id="libraryPath" value="${this.newLibraryPath}" placeholder="例如：/Users/xxx/Videos">
              </div>
              <p style="font-size:12px;color:var(--text-secondary);margin-top:8px;">
                请输入本地文件夹的完整路径
              </p>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="cancelAdd">取消</button>
            <button class="btn btn-primary" id="confirmAdd">添加</button>
          </div>
        </div>
      </div>
    `;
  },
  
  renderUserManageModal() {
    const libs = store.libraries || [];
    return `
      <div class="modal-overlay" id="userManageModal">
        <div class="modal" style="max-width:800px;">
          <div class="modal-header">
            <h2>用户管理</h2>
            <button class="btn-icon" id="closeUserManage">✕</button>
          </div>
          <div class="modal-body" style="overflow-x:auto;">
            <table class="user-permission-table" style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="border-bottom:1px solid var(--border-color);">
                  <th style="text-align:left;padding:12px;min-width:100px;">用户名</th>
                  <th style="text-align:left;padding:12px;width:80px;">角色</th>
                  ${libs.map(lib => `<th style="text-align:center;padding:12px;min-width:100px;" title="${this.escapeHtml(lib.name)}">${this.escapeHtml(lib.name.length > 8 ? lib.name.substring(0, 8) + '...' : lib.name)}</th>`).join('')}
                  <th style="text-align:left;padding:12px;width:60px;">操作</th>
                </tr>
              </thead>
              <tbody>
                ${this.users.map(user => `
                  <tr style="border-bottom:1px solid var(--border-color);">
                    <td style="padding:12px;">${this.escapeHtml(user.username)}</td>
                    <td style="padding:12px;">${user.is_admin ? '<span style="color:var(--primary-color);">管理员</span>' : '用户'}</td>
                    ${libs.map(lib => `
                      <td style="text-align:center;padding:12px;">
                        ${user.is_admin ? '<span style="color:var(--success-color);">✓</span>' : `
                          <input type="checkbox" class="lib-checkbox" data-user-id="${user.id}" data-lib-id="${lib.id}" ${user.library_ids.includes(lib.id) ? 'checked' : ''} />
                        `}
                      </td>
                    `).join('')}
                    <td style="padding:12px;">
                      ${!user.is_admin && user.id !== store.user?.id ? `
                        <button class="btn btn-danger btn-small delete-user-btn" data-user-id="${user.id}">删除</button>
                      ` : ''}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="closeUserManageBtn">关闭</button>
            <button class="btn btn-primary" id="saveUserLibraries">保存</button>
          </div>
        </div>
      </div>
    `;
  },
  
  renderChangePasswordModal() {
    return `
      <div class="modal-overlay" id="changePasswordModal">
        <div class="modal">
          <div class="modal-header">
            <h2>修改密码</h2>
            <button class="btn-icon" id="closeChangePassword">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label for="oldPassword">原密码</label>
              <input type="password" id="oldPassword" placeholder="请输入原密码">
            </div>
            <div class="form-group">
              <label for="newPassword">新密码</label>
              <input type="password" id="newPassword" placeholder="请输入新密码（至少4位）">
            </div>
            <div class="form-group">
              <label for="confirmPassword">确认新密码</label>
              <input type="password" id="confirmPassword" placeholder="请再次输入新密码">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="cancelChangePassword">取消</button>
            <button class="btn btn-primary" id="confirmChangePassword">确认修改</button>
          </div>
        </div>
      </div>
    `;
  },
  
  bindEvents() {
    document.getElementById('userMenuBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('userMenuDropdown').classList.toggle('show');
    });
    
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.user-menu')) {
        document.getElementById('userMenuDropdown')?.classList.remove('show');
      }
    });
    
    document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      api.setToken(null);
      store.reset();
      window.dispatchEvent(new CustomEvent('logout'));
    });
    
    document.getElementById('userManageBtn')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      this.showUserManageModal = true;
      try {
        this.users = await api.getUsers();
        this.render();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    
    document.getElementById('closeUserManage')?.addEventListener('click', () => {
      this.showUserManageModal = false;
      this.render();
    });
    
    document.getElementById('closeUserManageBtn')?.addEventListener('click', () => {
      this.showUserManageModal = false;
      this.render();
    });
    
    document.getElementById('saveUserLibraries')?.addEventListener('click', async () => {
      try {
        const userLibraryMap = {};
        document.querySelectorAll('.lib-checkbox').forEach(checkbox => {
          const userId = parseInt(checkbox.dataset.userId);
          const libId = parseInt(checkbox.dataset.libId);
          if (!userLibraryMap[userId]) {
            userLibraryMap[userId] = [];
          }
          if (checkbox.checked) {
            userLibraryMap[userId].push(libId);
          }
        });
        
        for (const [userId, libraryIds] of Object.entries(userLibraryMap)) {
          await api.updateUserLibraries(parseInt(userId), libraryIds);
        }
        
        showToast('用户权限已更新', 'success');
        this.showUserManageModal = false;
        this.render();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    
    document.querySelectorAll('.delete-user-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const userId = parseInt(btn.dataset.userId);
        if (confirm('确定要删除这个用户吗？')) {
          try {
            await api.deleteUser(userId);
            this.users = this.users.filter(u => u.id !== userId);
            this.render();
            showToast('用户已删除', 'success');
          } catch (err) {
            showToast(err.message, 'error');
          }
        }
      });
    });
    
    document.getElementById('changePasswordBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showChangePasswordModal = true;
      this.render();
    });
    
    document.getElementById('closeChangePassword')?.addEventListener('click', () => {
      this.showChangePasswordModal = false;
      this.render();
    });
    
    document.getElementById('cancelChangePassword')?.addEventListener('click', () => {
      this.showChangePasswordModal = false;
      this.render();
    });
    
    document.getElementById('confirmChangePassword')?.addEventListener('click', async () => {
      const oldPassword = document.getElementById('oldPassword').value;
      const newPassword = document.getElementById('newPassword').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      
      if (!oldPassword || !newPassword || !confirmPassword) {
        showToast('请填写所有密码字段', 'error');
        return;
      }
      
      if (newPassword.length < 4) {
        showToast('新密码至少4位', 'error');
        return;
      }
      
      if (newPassword !== confirmPassword) {
        showToast('两次输入的新密码不一致', 'error');
        return;
      }
      
      try {
        await api.changePassword(oldPassword, newPassword);
        showToast('密码修改成功', 'success');
        this.showChangePasswordModal = false;
        this.render();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    
    document.getElementById('addLibraryBtn')?.addEventListener('click', () => {
      this.showAddModal = true;
      this.render();
    });
    
    document.getElementById('closeModal')?.addEventListener('click', () => {
      this.showAddModal = false;
      this.render();
    });
    
    document.getElementById('cancelAdd')?.addEventListener('click', () => {
      this.showAddModal = false;
      this.render();
    });
    
    document.getElementById('confirmAdd')?.addEventListener('click', async () => {
      const name = document.getElementById('libraryName').value.trim();
      const pathInput = document.getElementById('libraryPath').value.trim();
      
      if (!name || !pathInput) {
        showToast('请填写完整信息', 'error');
        return;
      }
      
      try {
        await api.createLibrary(name, pathInput);
        this.showAddModal = false;
        await this.init();
        this.render();
        showToast('媒体库创建成功，正在扫描...', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    
    document.querySelectorAll('.library-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.actions')) return;
        const id = parseInt(card.dataset.id);
        const library = store.libraries.find(l => l.id === id);
        if (library) {
          store.setCurrentLibrary(library);
          window.dispatchEvent(new CustomEvent('navigate-library', { detail: library }));
        }
      });
    });
    
    document.querySelectorAll('.rescan-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        try {
          await api.syncLibrary(id);
          showToast('开始同步', 'success');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
    
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        if (confirm('确定要删除这个媒体库吗？这只会删除数据库记录，不会删除实际文件。')) {
          try {
            await api.deleteLibrary(id);
            await this.init();
            this.render();
            showToast('媒体库已删除', 'success');
          } catch (err) {
            showToast(err.message, 'error');
          }
        }
      });
    });
  },
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};
