class LibrariesPage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      showAddModal: false,
      showUserManageModal: false,
      showChangePasswordModal: false,
      showSettingsModal: false,
      users: [],
      newPassword: '',
      confirmPassword: ''
    };
  }

  render() {
    const { libraries, isAdmin, user } = store;
    const { showAddModal, showUserManageModal, showChangePasswordModal, showSettingsModal } = this.state;
    
    return `
      <div class="app-layout">
        <aside class="sidebar">
          <div class="sidebar-header">
            <h2>PeachBrowser</h2>
          </div>
          <div class="sidebar-section">
            <h3>${t('navigation.libraries')}</h3>
            <ul class="sidebar-nav">
              <li class="active">
                <span>📚</span> ${t('navigation.libraries')}
              </li>
            </ul>
          </div>
        </aside>
        
        <main class="main-content">
          <header class="header">
            <h1>${t('libraries.title')}</h1>
            <div class="header-actions">
              <button class="btn btn-secondary btn-small settings-btn" title="${t('header.settings')}">⚙️</button>
              <div class="user-menu">
                <button class="user-menu-btn">
                  <span>👤</span>
                  <span>${escapeHtml(user?.username || 'User')}${isAdmin ? ` (${t('user.admin')})` : ''}</span>
                </button>
                <div class="user-menu-dropdown">
                  ${isAdmin ? `<button class="user-manage-btn">${t('user.userManagement')}</button>` : ''}
                  <button class="change-password-btn">${t('user.changePassword')}</button>
                  <button class="logout-btn">${t('user.logout')}</button>
                </div>
              </div>
            </div>
          </header>
          
          <div class="content">
            ${libraries.length === 0 ? `
              <div class="empty-state">
                <div class="icon">📁</div>
                <h3>${t('libraries.noLibraries')}</h3>
                <p>${isAdmin ? t('libraries.addLibraryHint') : t('libraries.contactAdmin')}</p>
              </div>
            ` : `
              <div class="libraries-grid">
                ${libraries.map(lib => this._renderLibraryCard(lib, isAdmin)).join('')}
              </div>
            `}
            
            ${isAdmin ? `
              <button class="btn btn-primary add-library-btn" style="position:fixed;bottom:24px;right:24px;">
                + ${t('libraries.addLibrary')}
              </button>
            ` : ''}
          </div>
        </main>
      </div>
      
      ${showAddModal ? this._renderAddModal() : ''}
      ${showUserManageModal ? this._renderUserManageModal() : ''}
      ${showChangePasswordModal ? this._renderChangePasswordModal() : ''}
      ${showSettingsModal ? this._renderSettingsModal() : ''}
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
            <button class="btn btn-secondary btn-small rescan-btn" data-id="${lib.id}">${t('libraries.rescan')}</button>
            <button class="btn btn-danger btn-small delete-btn" data-id="${lib.id}">${t('libraries.delete')}</button>
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
            <h2>${t('libraries.addLibrary')}</h2>
            <button class="btn-icon close-modal-btn">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label for="libraryName">${t('libraries.libraryName')}</label>
              <input type="text" id="libraryName" placeholder="${t('libraries.namePlaceholder')}">
            </div>
            <div class="form-group">
              <label for="libraryPath">${t('libraries.libraryPath')}</label>
              <div class="folder-picker">
                <input type="text" id="libraryPath" placeholder="${t('libraries.pathPlaceholder')}">
              </div>
              <p style="font-size:12px;color:var(--text-secondary);margin-top:8px;">
                ${t('libraries.pathHint')}
              </p>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary cancel-add-btn">${t('confirm.cancel')}</button>
            <button class="btn btn-primary confirm-add-btn">${t('confirm.add')}</button>
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
            <h2>${t('password.title')}</h2>
            <button class="btn-icon close-change-password-btn">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label for="oldPassword">${t('password.oldPassword')}</label>
              <input type="password" id="oldPassword" placeholder="${t('password.oldPasswordPlaceholder')}">
            </div>
            <div class="form-group">
              <label for="newPassword">${t('password.newPassword')}</label>
              <input type="password" id="newPassword" placeholder="${t('password.newPasswordPlaceholder')}">
            </div>
            <div class="form-group">
              <label for="confirmPassword">${t('password.confirmPassword')}</label>
              <input type="password" id="confirmPassword" placeholder="${t('password.confirmPasswordPlaceholder')}">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary cancel-change-password-btn">${t('password.cancel')}</button>
            <button class="btn btn-primary confirm-change-password-btn">${t('password.confirmChange')}</button>
          </div>
        </div>
      </div>
    `;
  }

  _renderSettingsModal() {
    const languages = [
      { code: 'auto', name: t('settings.languageAuto') },
      { code: 'zh-CN', name: t('settings.languageZh') },
      { code: 'en-US', name: t('settings.languageEn') },
      { code: 'ja-JP', name: t('settings.languageJa') }
    ];
    
    const currentLang = store.getLanguage();
    
    return `
      <div class="modal-overlay settings-modal">
        <div class="modal">
          <div class="modal-header">
            <h2>${t('settings.title')}</h2>
            <button class="btn-icon close-settings-btn">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label for="language-select">${t('settings.language')}</label>
              <select id="language-select" class="language-select">
                ${languages.map(lang => `
                  <option value="${lang.code}" ${currentLang === lang.code || (lang.code === 'auto' && !localStorage.getItem('peechbrowser_language')) ? 'selected' : ''}>
                    ${lang.name}
                  </option>
                `).join('')}
              </select>
              <p style="font-size:12px;color:var(--text-secondary);margin-top:8px;">
                ${t('settings.languageHint')}
              </p>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary close-settings-btn">${t('confirm.close')}</button>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    this._bindUserMenuEvents();
    this._bindLibraryCardEvents();
    this._bindModalEvents();
    this._bindSettingsModalEvents();
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
        this.setState({ users, showUserManageModal: true });
      } catch (err) {
        window.showToast?.(err.message, 'error');
      }
    });
    
    this.$('.change-password-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setState({ showChangePasswordModal: true });
    });
    
    this.$('.settings-btn')?.addEventListener('click', () => {
      this.setState({ showSettingsModal: true });
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
          window.showToast?.(t('scan.syncStarted'), 'success');
        } catch (err) {
          window.showToast?.(err.message, 'error');
        }
      });
    });
    
    this.$$('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        if (confirm(t('libraries.deleteConfirm'))) {
          try {
            await api.deleteLibrary(id);
            const libraries = await api.getLibraries();
            store.setLibraries(libraries);
            this.update();
            window.showToast?.(t('messages.libraryDeleted'), 'success');
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
        window.showToast?.(t('messages.fillCompleteInfo'), 'error');
        return;
      }
      
      try {
        await api.createLibrary(name, path);
        this.setState({ showAddModal: false });
        const libraries = await api.getLibraries();
        store.setLibraries(libraries);
        this.update();
        window.showToast?.(t('scan.syncSuccess'), 'success');
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
        
        window.showToast?.(t('messages.userPermissionsUpdated'), 'success');
        this.setState({ showUserManageModal: false });
      } catch (err) {
        window.showToast?.(err.message, 'error');
      }
    });
    
    this.$$('.delete-user-btn', modal).forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const userId = parseInt(btn.dataset.userId);
        if (confirm(t('messages.deleteUserConfirm'))) {
          try {
            await api.deleteUser(userId);
            const users = this.state.users.filter(u => u.id !== userId);
            this.setState({ users });
            window.showToast?.(t('messages.userDeleted'), 'success');
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
        window.showToast?.(t('password.fillAll'), 'error');
        return;
      }
      
      if (newPassword.length < 4) {
        window.showToast?.(t('password.minLength'), 'error');
        return;
      }
      
      if (newPassword !== confirmPassword) {
        window.showToast?.(t('password.notMatch'), 'error');
        return;
      }
      
      try {
        await api.changePassword(oldPassword, newPassword);
        window.showToast?.(t('password.success'), 'success');
        this.setState({ showChangePasswordModal: false });
      } catch (err) {
        window.showToast?.(err.message, 'error');
      }
    });
  }

  _bindSettingsModalEvents() {
    const modal = this.$('.settings-modal');
    if (!modal) return;
    
    this.$$('.close-settings-btn', modal).forEach(btn => {
      btn.addEventListener('click', () => {
        this.setState({ showSettingsModal: false });
      });
    });
    
    this.$('.language-select', modal)?.addEventListener('change', (e) => {
      const lang = e.target.value;
      if (lang === 'auto') {
        localStorage.removeItem('peechbrowser_language');
        store.setLanguage(i18n.detectLanguage());
      } else {
        store.setLanguage(lang);
      }
      this.setState({ showSettingsModal: false });
      setTimeout(() => {
        this.update();
        this.bindEvents();
      }, 50);
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