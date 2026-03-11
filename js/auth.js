/**
 * KingCloud - Auth Manager
 * Handles login, logout, session, and credential management.
 * All data stored in localStorage only.
 */

const Auth = (() => {
  const KEY_SESSION = 'kc_session';
  const KEY_USERS   = 'kc_users';
  const KEY_STORJ   = 'kc_storj';

  // --- Crypto helpers ---
  async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + 'kingcloud_salt_v1');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // --- User Store ---
  function getUsers() {
    const raw = localStorage.getItem(KEY_USERS);
    if (raw) { try { return JSON.parse(raw); } catch(e) {} }
    return null;
  }

  async function initDefaultUser() {
    let users = getUsers();
    if (!users) {
      const hash = await hashPassword('kingcloud123');
      users = { admin: { hash, avatarColor: '#6c63ff', createdAt: Date.now() } };
      localStorage.setItem(KEY_USERS, JSON.stringify(users));
    }
    return users;
  }

  // --- Login ---
  async function login(username, password, remember) {
    const users = getUsers() || await initDefaultUser();
    const user = users[username.toLowerCase().trim()];
    if (!user) return { ok: false, error: 'Invalid username or password.' };

    const hash = await hashPassword(password);
    if (hash !== user.hash) return { ok: false, error: 'Invalid username or password.' };

    const session = {
      username: username.toLowerCase().trim(),
      avatarColor: user.avatarColor || '#6c63ff',
      loginAt: Date.now(),
      remember: !!remember
    };

    localStorage.setItem(KEY_SESSION, JSON.stringify(session));
    return { ok: true, session };
  }

  // --- Logout ---
  function logout() {
    localStorage.removeItem(KEY_SESSION);
    window.location.href = 'index.html';
  }

  // --- Session Check ---
  function getSession() {
    const raw = localStorage.getItem(KEY_SESSION);
    if (!raw) return null;
    try {
      const session = JSON.parse(raw);
      // Check timeout
      const timeout = parseInt(localStorage.getItem('kc_timeout') || '0');
      if (timeout > 0) {
        const elapsed = (Date.now() - session.loginAt) / 60000;
        if (elapsed > timeout) { localStorage.removeItem(KEY_SESSION); return null; }
      }
      return session;
    } catch(e) { return null; }
  }

  function requireAuth() {
    const session = getSession();
    if (!session) {
      window.location.href = 'index.html';
      return null;
    }
    return session;
  }

  // --- Change Username ---
  async function changeUsername(currentUsername, newUsername) {
    newUsername = newUsername.toLowerCase().trim();
    if (!newUsername || newUsername.length < 3) return { ok: false, error: 'Username must be at least 3 characters.' };
    if (!/^[a-z0-9_]+$/.test(newUsername)) return { ok: false, error: 'Only letters, numbers, underscores allowed.' };

    const users = getUsers();
    if (!users || !users[currentUsername]) return { ok: false, error: 'User not found.' };
    if (users[newUsername] && newUsername !== currentUsername) return { ok: false, error: 'Username already taken.' };

    const userData = users[currentUsername];
    delete users[currentUsername];
    users[newUsername] = userData;
    localStorage.setItem(KEY_USERS, JSON.stringify(users));

    // Update session
    const session = getSession();
    if (session) {
      session.username = newUsername;
      localStorage.setItem(KEY_SESSION, JSON.stringify(session));
    }
    return { ok: true };
  }

  // --- Change Password ---
  async function changePassword(username, currentPass, newPass, confirmPass) {
    if (newPass !== confirmPass) return { ok: false, error: 'New passwords do not match.' };
    if (newPass.length < 6) return { ok: false, error: 'Password must be at least 6 characters.' };

    const users = getUsers();
    if (!users || !users[username]) return { ok: false, error: 'User not found.' };

    const currentHash = await hashPassword(currentPass);
    if (currentHash !== users[username].hash) return { ok: false, error: 'Current password is incorrect.' };

    users[username].hash = await hashPassword(newPass);
    localStorage.setItem(KEY_USERS, JSON.stringify(users));
    return { ok: true };
  }

  // --- Avatar Color ---
  function setAvatarColor(username, color) {
    const users = getUsers();
    if (!users || !users[username]) return;
    users[username].avatarColor = color;
    localStorage.setItem(KEY_USERS, JSON.stringify(users));
    const session = getSession();
    if (session) { session.avatarColor = color; localStorage.setItem(KEY_SESSION, JSON.stringify(session)); }
  }

  // --- Storj Credentials ---
  function saveStorjCreds(creds) {
    localStorage.setItem(KEY_STORJ, JSON.stringify(creds));
  }

  function getStorjCreds() {
    const raw = localStorage.getItem(KEY_STORJ);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch(e) { return null; }
  }

  function clearStorjCreds() {
    localStorage.removeItem(KEY_STORJ);
  }

  // --- Export Backup ---
  function exportBackup() {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      users: localStorage.getItem(KEY_USERS),
      storj: localStorage.getItem(KEY_STORJ)
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'kingcloud-backup.json';
    a.click(); URL.revokeObjectURL(url);
  }

  // --- Clear All Data ---
  function clearAllData() {
    localStorage.clear();
    window.location.href = 'index.html';
  }

  // Init default user on first load
  initDefaultUser();

  return {
    login, logout, getSession, requireAuth,
    changeUsername, changePassword, setAvatarColor,
    saveStorjCreds, getStorjCreds, clearStorjCreds,
    exportBackup, clearAllData, initDefaultUser
  };
})();
