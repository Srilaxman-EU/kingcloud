/**
 * KingCloud - Settings Page Manager
 * Handles appearance, account, storage, and advanced settings.
 */

(async () => {
  // ── Auth guard ───────────────────────────────────────────────────────────
  const session = Auth.requireAuth();
  if (!session) return;

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const userAvatar  = document.getElementById('user-avatar');
  const userName    = document.getElementById('user-name');
  const btnLogout   = document.getElementById('btn-logout');
  const menuToggle  = document.getElementById('menu-toggle');
  const sidebar     = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebar-overlay');

  // Nav
  const navItems    = document.querySelectorAll('.settings-nav-item[data-section]');
  const sections    = document.querySelectorAll('.settings-section[data-section]');

  // Appearance
  const themeOptions    = document.querySelectorAll('.theme-option[data-theme-value]');
  const fontSizeOptions = document.querySelectorAll('.fontsize-option[data-fontsize-value]');
  const compactToggle   = document.getElementById('compact-toggle');
  const animToggle      = document.getElementById('anim-toggle');

  // Account
  const avatarLarge   = document.getElementById('avatar-large');
  const accountName   = document.getElementById('account-name');
  const colorSwatches = document.querySelectorAll('.color-swatch[data-color]');
  const formUsername  = document.getElementById('form-username');
  const newUsername   = document.getElementById('new-username');
  const btnSaveUsername = document.getElementById('btn-save-username');
  const formPassword  = document.getElementById('form-password');
  const currentPass   = document.getElementById('current-pass');
  const newPass       = document.getElementById('new-pass');
  const confirmPass   = document.getElementById('confirm-pass');
  const btnSavePassword = document.getElementById('btn-save-password');

  // Storage
  const storjEndpoint   = document.getElementById('storj-endpoint');
  const storjAccessKey  = document.getElementById('storj-access-key');
  const storjSecretKey  = document.getElementById('storj-secret-key');
  const storjBucket     = document.getElementById('storj-bucket');
  const storjRegion     = document.getElementById('storj-region');
  const storjLimit      = document.getElementById('storj-limit');
  const btnSaveStorj    = document.getElementById('btn-save-storj');
  const btnTestStorj    = document.getElementById('btn-test-storj');
  const storjStatus     = document.getElementById('storj-status');

  // Advanced
  const sessionTimeout  = document.getElementById('session-timeout');
  const btnExportBackup = document.getElementById('btn-export-backup');
  const btnClearData    = document.getElementById('btn-clear-data');

  // ── Init ─────────────────────────────────────────────────────────────────
  function init() {
    // User info
    if (userAvatar) {
      userAvatar.textContent      = session.username.charAt(0).toUpperCase();
      userAvatar.style.background = session.avatarColor || '#6c63ff';
    }
    if (userName)  userName.textContent  = session.username;
    if (avatarLarge) {
      avatarLarge.textContent      = session.username.charAt(0).toUpperCase();
      avatarLarge.style.background = session.avatarColor || '#6c63ff';
    }
    if (accountName) accountName.textContent = session.username;

    // Pre-fill forms
    if (newUsername)  newUsername.value   = session.username;
    if (sessionTimeout) {
      const saved = localStorage.getItem('kc_timeout') || '0';
      sessionTimeout.value = saved;
    }

    // Storj creds
    const creds = Auth.getStorjCreds();
    if (creds) {
      if (storjEndpoint)  storjEndpoint.value  = creds.endpoint  || '';
      if (storjAccessKey) storjAccessKey.value = creds.accessKey || '';
      if (storjSecretKey) storjSecretKey.value = creds.secretKey || '';
      if (storjBucket)    storjBucket.value    = creds.bucket    || '';
      if (storjRegion)    storjRegion.value    = creds.region    || 'us-east-1';
      if (storjLimit)     storjLimit.value     = creds.storageLimitGB || '150';
    }

    // Compact & animation toggles
    if (compactToggle) compactToggle.checked = Theme.getCompact();
    if (animToggle)    animToggle.checked    = localStorage.getItem('kc_anim') !== 'false';

    // Active swatch
    updateSwatches(session.avatarColor || '#6c63ff');

    // Hash fragment → section (default to appearance)
    const hash = location.hash.replace('#', '');
    switchSection(hash && hash.match(/^(appearance|account|storage|advanced)$/) ? hash : 'appearance');

    attachListeners();
  }

  // ── Navigation ───────────────────────────────────────────────────────────
  function switchSection(id) {
    navItems.forEach(n => n.classList.toggle('active', n.dataset.section === id));
    sections.forEach(s => s.classList.toggle('active', s.dataset.section === id));
    location.hash = id;
  }

  // ── Listeners ────────────────────────────────────────────────────────────
  function attachListeners() {
    // Nav
    navItems.forEach(n => n.addEventListener('click', () => switchSection(n.dataset.section)));

    // Theme
    themeOptions.forEach(opt => opt.addEventListener('click', () => {
      Theme.applyTheme(opt.dataset.themeValue);
      themeOptions.forEach(o => o.classList.toggle('active', o.dataset.themeValue === opt.dataset.themeValue));
    }));

    // Font size
    fontSizeOptions.forEach(opt => opt.addEventListener('click', () => {
      Theme.applyFontSize(opt.dataset.fontsizeValue);
    }));

    // Compact
    if (compactToggle) compactToggle.addEventListener('change', () => Theme.applyCompact(compactToggle.checked));

    // Animations
    if (animToggle) animToggle.addEventListener('change', () => {
      localStorage.setItem('kc_anim', animToggle.checked ? 'true' : 'false');
    });

    // Avatar color swatches
    colorSwatches.forEach(sw => sw.addEventListener('click', () => {
      const color = sw.dataset.color;
      Auth.setAvatarColor(session.username, color);
      if (userAvatar)   userAvatar.style.background   = color;
      if (avatarLarge)  avatarLarge.style.background  = color;
      updateSwatches(color);
      showToast('Avatar color updated.', 'success');
    }));

    // Change username
    if (btnSaveUsername && formUsername) {
      formUsername.addEventListener('submit', async e => {
        e.preventDefault();
        const nu = newUsername ? newUsername.value.trim() : '';
        btnSaveUsername.disabled = true;
        const res = await Auth.changeUsername(session.username, nu);
        btnSaveUsername.disabled = false;
        if (res.ok) {
          session.username = nu;
          if (userName)    userName.textContent    = nu;
          if (accountName) accountName.textContent = nu;
          if (userAvatar)  userAvatar.textContent  = nu.charAt(0).toUpperCase();
          if (avatarLarge) avatarLarge.textContent = nu.charAt(0).toUpperCase();
          showToast('Username updated.', 'success');
        } else {
          showToast(res.error, 'error');
        }
      });
    }

    // Change password
    if (btnSavePassword && formPassword) {
      formPassword.addEventListener('submit', async e => {
        e.preventDefault();
        const cp = currentPass ? currentPass.value : '';
        const np = newPass     ? newPass.value     : '';
        const cf = confirmPass ? confirmPass.value : '';
        btnSavePassword.disabled = true;
        const res = await Auth.changePassword(session.username, cp, np, cf);
        btnSavePassword.disabled = false;
        if (res.ok) {
          if (currentPass) currentPass.value = '';
          if (newPass)     newPass.value     = '';
          if (confirmPass) confirmPass.value = '';
          showToast('Password updated.', 'success');
        } else {
          showToast(res.error, 'error');
        }
      });
    }

    // Storj save
    if (btnSaveStorj) btnSaveStorj.addEventListener('click', saveStorjCreds);

    // Storj test
    if (btnTestStorj) btnTestStorj.addEventListener('click', testStorjConnection);

    // Session timeout
    if (sessionTimeout) sessionTimeout.addEventListener('change', () => {
      localStorage.setItem('kc_timeout', sessionTimeout.value);
      showToast('Session timeout saved.', 'success');
    });

    // Export backup
    if (btnExportBackup) btnExportBackup.addEventListener('click', () => {
      Auth.exportBackup();
      showToast('Backup exported.', 'success');
    });

    // Clear data
    if (btnClearData) btnClearData.addEventListener('click', () => {
      if (confirm('This will clear ALL app data and log you out. Are you sure?')) {
        Auth.clearAllData();
      }
    });

    // Logout
    if (btnLogout) btnLogout.addEventListener('click', () => Auth.logout());

    // Mobile sidebar
    if (menuToggle)     menuToggle.addEventListener('click', openSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);
  }

  // ── Storj credentials ────────────────────────────────────────────────────
  function saveStorjCreds() {
    const creds = {
      endpoint:      storjEndpoint  ? storjEndpoint.value.trim()  : '',
      accessKey:     storjAccessKey ? storjAccessKey.value.trim() : '',
      secretKey:     storjSecretKey ? storjSecretKey.value.trim() : '',
      bucket:        storjBucket    ? storjBucket.value.trim()    : '',
      region:        storjRegion    ? storjRegion.value.trim()    : 'us-east-1',
      storageLimitGB: storjLimit    ? storjLimit.value            : '150'
    };
    if (!creds.endpoint || !creds.accessKey || !creds.secretKey || !creds.bucket) {
      showToast('Please fill in all required Storj fields.', 'warning');
      return;
    }
    Auth.saveStorjCreds(creds);
    showToast('Storj credentials saved.', 'success');
    updateStorjStatus('unknown');
  }

  async function testStorjConnection() {
    if (btnTestStorj) { btnTestStorj.disabled = true; btnTestStorj.textContent = 'Testing…'; }
    updateStorjStatus('unknown');

    const creds = {
      endpoint:  storjEndpoint  ? storjEndpoint.value.trim()  : '',
      accessKey: storjAccessKey ? storjAccessKey.value.trim() : '',
      secretKey: storjSecretKey ? storjSecretKey.value.trim() : '',
      bucket:    storjBucket    ? storjBucket.value.trim()    : '',
      region:    storjRegion    ? storjRegion.value.trim()    : 'us-east-1'
    };

    const res = await StorjClient.testConnection(creds);

    if (btnTestStorj) { btnTestStorj.disabled = false; btnTestStorj.textContent = 'Test Connection'; }

    if (res.ok) {
      updateStorjStatus('connected');
      showToast('Connection successful! ✅', 'success');
    } else {
      updateStorjStatus('disconnected');
      showToast('Connection failed: ' + res.error, 'error');
    }
  }

  function updateStorjStatus(state) {
    if (!storjStatus) return;
    const labels = { connected: '● Connected', disconnected: '● Disconnected', unknown: '● Not tested' };
    storjStatus.textContent = labels[state] || labels.unknown;
    storjStatus.className   = `storj-status ${state}`;
  }

  // ── Swatches ─────────────────────────────────────────────────────────────
  function updateSwatches(activeColor) {
    colorSwatches.forEach(sw => sw.classList.toggle('active', sw.dataset.color === activeColor));
  }

  // ── Sidebar (mobile) ─────────────────────────────────────────────────────
  function openSidebar()  {
    if (sidebar) sidebar.classList.add('open');
    if (sidebarOverlay) sidebarOverlay.classList.add('active');
  }
  function closeSidebar() {
    if (sidebar) sidebar.classList.remove('open');
    if (sidebarOverlay) sidebarOverlay.classList.remove('active');
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
  function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const msgEl = document.createElement('span');
    msgEl.textContent = msg;
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span>`;
    toast.appendChild(msgEl);
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  init();

})();
