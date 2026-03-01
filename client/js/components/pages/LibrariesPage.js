const Component = require('../base/Component');
const { escapeHtml } = require('../../utils/format');
const store = require('../../core/store');
const api = require('../../core/api');

class LibrariesPage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      showAddModal: false,
      showUserManageModal: false,
      showChangePasswordModal: false,
      users: [],
      newPassword: '',
      confirmPassword: ''
    };
  }

  render() {
    const { libraries, isAdmin, user } = store;
    const { showAddModal, showUserManageModal, showChangePasswordModal } = this.state;
    
    return `
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
                <button class="user-menu-btn">
                  <span>👤</span>
                  <span>${escapeHtml(user?.username || 'User')}${isAdmin ? ' (管理员)' : ''}</span>
                </button>
                <div class="user-menu-dropdown">
                  ${isAdmin ? '<button class="user-manage-btn">用户管理</button>' : ''}
                  <button class="change-password-btn">修改密码</button>
                  <button class="logout-btn">退出登录</button>
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
                ${libraries.map(lib => this._renderLibraryCard(lib, isAdmin)).join('')}
              </div>
            `}
            
            ${isAdmin ? `
              <button class="btn btn-primary add-library-btn" style="position:fixed;bottom:24px;right:24px;">
                + 添加媒体库
              </button>
            ` : ''}
          </div>
        </main>
      </div>
      
      ${showAddModal ? this._renderAddModal() : ''}
      ${showUserManageModal ? this._renderUserManageModal() : ''}
      ${showChangePasswordModal ? this._renderChangePasswordModal() : ''}
    `;
  }

  _renderLibraryCard(lib, isAdmin) {
    return `
      <div class="library-card" data-id="${lib.id}">
        <h3>
          <span>📁</span>
          ${escapeHtml(lib.name)}
        </h3>
        <p class="path">${escapeHtml(lib.path)}</p>
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
    `;
  }

  _renderAddModal() {
    return `
      <div class="modal-overlay add-modal">
        <div class="modal">
          <div class="modal-header">
            <h2>添加媒体库</h2>
            <button class="btn-icon close-modal-btn">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label for="libraryName">媒体库名称</label>
              <input type="text" id="libraryName" placeholder="例如：我的视频库">
            </div>
            <div class="form-group">
              <label for="libraryPath">文件夹路径</label>
              <div class="folder-picker">
                <input type="text" id="libraryPath" placeholder="例如：/Users/xxx/Videos">
              </div>
              <p style="font-size:12px;color:var(--text-secondary);margin-top:8px;">
                请输入本地文件夹的完整路径
              </p>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary cancel-add-btn">取消</button>
            <button class="btn btn-primary confirm-add-btn">添加</button>
          </div>
        </div>
      </div>
    `;
  }

  _renderUserManageModal() {
    const libs = store.libraries || [];
    const { users } = this.state;
    
    return `
      <div class="modal-overlay user-manage-modal">
        <div class="modal" style="max-width:800px;">
          <div class="modal-header">
            <h2>用户管理</h2>
            <button class="btn-icon close-user-manage-btn">✕</button>
          </div>
          <div class="modal-body" style="overflow-x:auto;">
            <table class="user-permission-table" style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="border-bottom:1px solid var(--border-color);">
                  <th style="text-align:left;padding:12px;min-width:100px;">用户名</th>
                  <th style="text-align:left;padding:12px;width:80px;">角色</th>
                  ${libs.map(lib => `<th style="text-align:center;padding:12px;min-width:100px;" title="${escapeHtml(lib.name)}">${escapeHtml(lib.name.length > 8 ? lib.name.substring(0, 8) + '...' : lib.name)}</th>`).join('')}
                  <th style="text-align:left;padding:12px;width:60px;">操作</th>
                </tr>
              </thead>
              <tbody>
                ${users.map(user => `
                  <tr style="border-bottom:1px solid var(--border-color);">
                    <td style="padding:12px;">${escapeHtml(user.username)}</td>
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
            <button class="btn btn-secondary close-user-manage-btn">关闭</button>
            <button class="btn btn-primary save-user-libraries-btn">保存</button>
          </div>
        </div>
      </div>
    `;
  }

  _renderChangePasswordModal() {
    return `
      <div class="modal-overlay change-password-modal">
        <div class="modal">
          <div class="modal-header">
            <h2>修改密码</h2>
            <button class="btn-icon close-change-password-btn">✕</button>
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
            <button class="btn btn-secondary cancel-change-password-btn">取消</button>
            <button class="btn btn-primary confirm-change-password-btn">确认修改</button>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    this._bindUserMenuEvents();
    this._bindLibraryCardEvents();
    this._bindModalEvents();
  }

  _bindUserMenuEvents() {
    const userMenuBtn = this.$('.user-menu-btn');
    const dropdown = this.$('.user-menu-dropdown');
    
    userMenuBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown?.classList.toggle('show');
    });
    
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.user-menu')) {
        dropdown?.classList.remove('show');
      }
    });
    
    this.$('.logout-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      api.setToken(null);
      store.reset();
      window.dispatchEvent(new CustomEvent('logout'));
    });
    
    this.$('.user-manage-btn')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const users = await api.getUsers();
        this.setState({ showUserManageModal: true, users });
      } catch (err) {
        window.showToast?.(err.message, 'error');
      }
    });
    
    this.$('.change-password-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setState({ showChangePasswordModal: true });
    });
  }

  _bindLibraryCardEvents() {
    this.$$('.library-card').forEach(card => {
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
    
    this.$$('.rescan-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        try {
          await api.syncLibrary(id);
          window.showToast?.('开始同步', 'success');
        } catch (err) {
          window.showToast?.(err.message, 'error');
        }
      });
    });
    
    this.$$('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        if (confirm('确定要删除这个媒体库吗？这只会删除数据库记录，不会删除实际文件。')) {
          try {
            await api.deleteLibrary(id);
            const libraries = await api.getLibraries();
            store.setLibraries(libraries);
            this.update();
            window.showToast?.('媒体库已删除', 'success');
          } catch (err) {
            window.showToast?.(err.message, 'error');
          }
        }
      });
    });
    
    this.$('.add-library-btn')?.addEventListener('click', () => {
      this.setState({ showAddModal: true });
    });
  }

  _bindModalEvents() {
    this._bindAddModalEvents();
    this._bindUserManageModalEvents();
    this._bindChangePasswordModalEvents();
  }

  _bindAddModalEvents() {
    const modal = this.$('.add-modal');
    if (!modal) return;
    
    this.$('.close-modal-btn', modal)?.addEventListener('click', () => {
      this.setState({ showAddModal: false });
    });
    
    this.$('.cancel-add-btn', modal)?.addEventListener('click', () => {
      this.setState({ showAddModal: false });
    });
    
    this.$('.confirm-add-btn', modal)?.addEventListener('click', async () => {
      const name = this.$('#libraryName')?.value?.trim();
      const path = this.$('#libraryPath')?.value?.trim();
      
      if (!name || !path) {
        window.showToast?.('请填写完整信息', 'error');
        return;
      }
      
      try {
        await api.createLibrary(name, path);
        this.setState({ showAddModal: false });
        const libraries = await api.getLibraries();
        store.setLibraries(libraries);
        this.update();
        window.showToast?.('媒体库创建成功，正在扫描...', 'success');
      } catch (err) {
        window.showToast?.(err.message, 'error');
      }
    });
  }

  _bindUserManageModalEvents() {
    const modal = this.$('.user-manage-modal');
    if (!modal) return;
    
    this.$$('.close-user-manage-btn', modal).forEach(btn => {
      btn.addEventListener('click', () => {
        this.setState({ showUserManageModal: false });
      });
    });
    
    this.$('.save-user-libraries-btn', modal)?.addEventListener('click', async () => {
      try {
        const userLibraryMap = {};
        this.$$('.lib-checkbox', modal).forEach(checkbox => {
          const userId = parseInt(checkbox.dataset.userId);
          const libId = parseInt(checkbox.dataset.libId);
          if (!userLibraryMap[userId]) userLibraryMap[userId] = [];
          if (checkbox.checked) userLibraryMap[userId].push(libId);
        });
        
        for (const [userId, libraryIds] of Object.entries(userLibraryMap)) {
          await api.updateUserLibraries(parseInt(userId), libraryIds);
        }
        
        window.showToast?.('用户权限已更新', 'success');
        this.setState({ showUserManageModal: false });
      } catch (err) {
        window.showToast?.(err.message, 'error');
      }
    });
    
    this.$$('.delete-user-btn', modal).forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const userId = parseInt(btn.dataset.userId);
        if (confirm('确定要删除这个用户吗？')) {
          try {
            await api.deleteUser(userId);
            const users = this.state.users.filter(u => u.id !== userId);
            this.setState({ users });
            window.showToast?.('用户已删除', 'success');
          } catch (err) {
            window.showToast?.(err.message, 'error');
          }
        }
      });
    });
  }

  _bindChangePasswordModalEvents() {
    const modal = this.$('.change-password-modal');
    if (!modal) return;
    
    this.$('.close-change-password-btn', modal)?.addEventListener('click', () => {
      this.setState({ showChangePasswordModal: false });
    });
    
    this.$('.cancel-change-password-btn', modal)?.addEventListener('click', () => {
      this.setState({ showChangePasswordModal: false });
    });
    
    this.$('.confirm-change-password-btn', modal)?.addEventListener('click', async () => {
      const oldPassword = this.$('#oldPassword')?.value;
      const newPassword = this.$('#newPassword')?.value;
      const confirmPassword = this.$('#confirmPassword')?.value;
      
      if (!oldPassword || !newPassword || !confirmPassword) {
        window.showToast?.('请填写所有密码字段', 'error');
        return;
      }
      
      if (newPassword.length < 4) {
        window.showToast?.('新密码至少4位', 'error');
        return;
      }
      
      if (newPassword !== confirmPassword) {
        window.showToast?.('两次输入的新密码不一致', 'error');
        return;
      }
      
      try {
        await api.changePassword(oldPassword, newPassword);
        window.showToast?.('密码修改成功', 'success');
        this.setState({ showChangePasswordModal: false });
      } catch (err) {
        window.showToast?.(err.message, 'error');
      }
    });
  }

  async loadLibraries() {
    try {
      const libraries = await api.getLibraries();
      store.setLibraries(libraries);
      this.update();
    } catch (err) {
      console.error('Failed to load libraries:', err);
    }
  }
}

module.exports = LibrariesPage;