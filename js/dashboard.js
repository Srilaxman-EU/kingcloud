/**
 * KingCloud - Dashboard / File Manager
 * Manages file listing, upload, download, delete, rename, search, sorting, view toggle.
 */

(async () => {
  // ── Auth guard ───────────────────────────────────────────────────────────
  const session = Auth.requireAuth();
  if (!session) return;

  // ── State ────────────────────────────────────────────────────────────────
  let allFiles   = [];
  let filteredFiles = [];
  let viewMode   = localStorage.getItem('kc_view') || 'grid';
  let sortMode   = localStorage.getItem('kc_sort') || 'date-desc';
  let searchQuery = '';
  let isLoading  = false;
  let uploadCount = 0;

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const fileContainer    = document.getElementById('file-container');
  const emptyState       = document.getElementById('empty-state');
  const searchInput      = document.getElementById('search-input');
  const sortSelect       = document.getElementById('sort-select');
  const btnRefresh       = document.getElementById('btn-refresh');
  const btnUpload        = document.getElementById('btn-upload');
  const fileInput        = document.getElementById('file-input');
  const viewGrid         = document.getElementById('view-grid');
  const viewList         = document.getElementById('view-list');
  const fileCount        = document.getElementById('file-count');
  const storageBar       = document.getElementById('storage-bar');
  const storageText      = document.getElementById('storage-text');
  const dropOverlay      = document.getElementById('drop-overlay');
  const uploadPanel      = document.getElementById('upload-panel');
  const uploadPanelClose = document.getElementById('upload-panel-close');
  const uploadItems      = document.getElementById('upload-items');
  const userAvatar       = document.getElementById('user-avatar');
  const userName         = document.getElementById('user-name');
  const btnLogout        = document.getElementById('btn-logout');
  const menuToggle       = document.getElementById('menu-toggle');
  const sidebar          = document.getElementById('sidebar');
  const sidebarOverlay   = document.getElementById('sidebar-overlay');

  // ── Rename modal ─────────────────────────────────────────────────────────
  const renameModal      = document.getElementById('rename-modal');
  const renameInput      = document.getElementById('rename-input');
  const renameCurrent    = document.getElementById('rename-current');
  const btnRenameSave    = document.getElementById('btn-rename-save');
  const btnRenameCancel  = document.getElementById('btn-rename-cancel');
  let   renameKey        = null;

  // ── Init ─────────────────────────────────────────────────────────────────
  function init() {
    // User info
    if (userAvatar) {
      userAvatar.textContent  = session.username.charAt(0).toUpperCase();
      userAvatar.style.background = session.avatarColor || '#6c63ff';
    }
    if (userName) userName.textContent = session.username;

    // View mode
    setViewMode(viewMode, false);
    // Sort
    if (sortSelect) sortSelect.value = sortMode;

    // Load files
    loadFiles();

    // Event listeners
    if (searchInput) searchInput.addEventListener('input', onSearch);
    if (sortSelect)  sortSelect.addEventListener('change', onSort);
    if (btnRefresh)  btnRefresh.addEventListener('click', loadFiles);
    if (btnUpload)   btnUpload.addEventListener('click', () => fileInput && fileInput.click());
    if (fileInput)   fileInput.addEventListener('change', onFilePicked);
    if (viewGrid)    viewGrid.addEventListener('click', () => setViewMode('grid'));
    if (viewList)    viewList.addEventListener('click', () => setViewMode('list'));
    if (btnLogout)   btnLogout.addEventListener('click', () => Auth.logout());
    if (uploadPanelClose) uploadPanelClose.addEventListener('click', () => uploadPanel && uploadPanel.classList.remove('active'));

    // Rename modal
    if (btnRenameCancel) btnRenameCancel.addEventListener('click', closeRenameModal);
    if (btnRenameSave)   btnRenameSave.addEventListener('click', doRename);
    if (renameInput)     renameInput.addEventListener('keydown', e => { if (e.key === 'Enter') doRename(); });

    // Mobile sidebar
    if (menuToggle)    menuToggle.addEventListener('click', openSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);

    // Drag-and-drop
    document.addEventListener('dragenter', onDragEnter);
    document.addEventListener('dragleave', onDragLeave);
    document.addEventListener('dragover',  e => e.preventDefault());
    document.addEventListener('drop',      onDrop);
  }

  // ── Load files ───────────────────────────────────────────────────────────
  async function loadFiles() {
    if (isLoading) return;
    isLoading = true;
    setLoading(true);

    try {
      allFiles = await StorjClient.listObjects();
      applyFiltersAndSort();
      updateStorageBar();
      renderFiles();
    } catch (e) {
      showToast('Failed to load files: ' + e.message, 'error');
      showEmpty('Could not connect to Storj. Check your credentials in Settings.', true);
    } finally {
      isLoading = false;
      setLoading(false);
    }
  }

  // ── Filter + Sort ────────────────────────────────────────────────────────
  function applyFiltersAndSort() {
    let list = allFiles.slice();

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(f => f.key.toLowerCase().includes(q));
    }

    // Sort
    switch (sortMode) {
      case 'date-desc': list.sort((a, b) => b.lastModified - a.lastModified); break;
      case 'date-asc':  list.sort((a, b) => a.lastModified - b.lastModified); break;
      case 'name-asc':  list.sort((a, b) => a.key.localeCompare(b.key));      break;
      case 'name-desc': list.sort((a, b) => b.key.localeCompare(a.key));      break;
      case 'size-desc': list.sort((a, b) => b.size - a.size);                 break;
      case 'size-asc':  list.sort((a, b) => a.size - b.size);                 break;
    }

    filteredFiles = list;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function renderFiles() {
    if (!fileContainer) return;
    fileContainer.innerHTML = '';

    if (filteredFiles.length === 0) {
      if (fileCount) fileCount.textContent = '0 files';
      showEmpty(searchQuery ? 'No files match your search.' : 'Your bucket is empty. Upload your first file!');
      return;
    }
    if (emptyState) emptyState.style.display = 'none';
    if (fileCount) {
      fileCount.textContent = `${filteredFiles.length} file${filteredFiles.length !== 1 ? 's' : ''}` +
        (searchQuery ? ` matching "${searchQuery}"` : '');
    }

    if (viewMode === 'grid') {
      fileContainer.className = 'file-grid';
      filteredFiles.forEach(f => fileContainer.appendChild(buildGridCard(f)));
    } else {
      fileContainer.className = 'file-list';
      filteredFiles.forEach(f => fileContainer.appendChild(buildListRow(f)));
    }
  }

  function buildGridCard(file) {
    const name    = file.key.split('/').pop() || file.key;
    const icon    = StorjClient.getFileIcon(name);
    const ftClass = StorjClient.getFileTypeClass(name);
    const div = document.createElement('div');
    div.className = 'file-card';
    div.innerHTML = `
      <div class="file-card-icon ${ftClass}">${icon}</div>
      <div class="file-card-name" title="${escHtml(name)}">${escHtml(name)}</div>
      <div class="file-card-size">${StorjClient.formatSize(file.size)}</div>
      <div class="file-card-actions">
        ${fileActionBtns(file.key)}
      </div>`;
    attachFileActions(div, file.key, name);
    return div;
  }

  function buildListRow(file) {
    const name    = file.key.split('/').pop() || file.key;
    const icon    = StorjClient.getFileIcon(name);
    const ftClass = StorjClient.getFileTypeClass(name);
    const div = document.createElement('div');
    div.className = 'file-row';
    div.innerHTML = `
      <div class="file-row-icon ${ftClass}">${icon}</div>
      <div class="file-row-name" title="${escHtml(file.key)}">${escHtml(name)}</div>
      <div class="file-row-meta">
        <span class="file-row-size">${StorjClient.formatSize(file.size)}</span>
        <span class="file-row-date">${formatDate(file.lastModified)}</span>
        <div class="file-row-actions">${fileActionBtns(file.key)}</div>
      </div>`;
    attachFileActions(div, file.key, name);
    return div;
  }

  function fileActionBtns(key) {
    return `
      <button class="btn-icon" data-action="download" title="Download" aria-label="Download">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </button>
      <button class="btn-icon" data-action="rename" title="Rename" aria-label="Rename">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="btn-icon danger" data-action="delete" title="Delete" aria-label="Delete">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
      </button>`;
  }

  function attachFileActions(el, key, name) {
    el.querySelector('[data-action="download"]').addEventListener('click', e => { e.stopPropagation(); doDownload(key, name); });
    el.querySelector('[data-action="rename"]').addEventListener('click',   e => { e.stopPropagation(); openRenameModal(key, name); });
    el.querySelector('[data-action="delete"]').addEventListener('click',   e => { e.stopPropagation(); doDelete(key, name); });
  }

  // ── Download ──────────────────────────────────────────────────────────────
  async function doDownload(key, name) {
    try {
      const url = await StorjClient.getDownloadUrl(key);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = name;
      a.target   = '_blank';
      a.rel      = 'noopener noreferrer';
      a.click();
      showToast(`Downloading ${name}`, 'success');
    } catch (e) {
      showToast('Download failed: ' + e.message, 'error');
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function doDelete(key, name) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await StorjClient.deleteObject(key);
      showToast(`"${name}" deleted.`, 'success');
      allFiles = allFiles.filter(f => f.key !== key);
      applyFiltersAndSort();
      renderFiles();
      updateStorageBar();
    } catch (e) {
      showToast('Delete failed: ' + e.message, 'error');
    }
  }

  // ── Rename ────────────────────────────────────────────────────────────────
  function openRenameModal(key, name) {
    renameKey = key;
    if (renameCurrent) renameCurrent.textContent = name;
    if (renameInput) {
      renameInput.value = name;
      renameInput.select();
    }
    if (renameModal) renameModal.classList.add('active');
    setTimeout(() => renameInput && renameInput.focus(), 50);
  }

  function closeRenameModal() {
    renameKey = null;
    if (renameModal) renameModal.classList.remove('active');
  }

  async function doRename() {
    if (!renameKey || !renameInput) return;
    const newName = renameInput.value.trim();
    if (!newName) { showToast('Please enter a file name.', 'warning'); return; }

    const dir    = renameKey.includes('/') ? renameKey.substring(0, renameKey.lastIndexOf('/') + 1) : '';
    const newKey = dir + newName;
    if (newKey === renameKey) { closeRenameModal(); return; }

    if (btnRenameSave) btnRenameSave.disabled = true;
    try {
      await StorjClient.renameObject(renameKey, newKey);
      showToast(`Renamed to "${newName}".`, 'success');
      closeRenameModal();
      await loadFiles();
    } catch (e) {
      showToast('Rename failed: ' + e.message, 'error');
    } finally {
      if (btnRenameSave) btnRenameSave.disabled = false;
    }
  }

  // ── Upload ────────────────────────────────────────────────────────────────
  function onFilePicked(e) {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) uploadFiles(files);
    e.target.value = '';
  }

  async function uploadFiles(files) {
    if (uploadPanel) uploadPanel.classList.add('active');
    if (uploadItems) uploadItems.innerHTML = '';

    for (const file of files) {
      const uploadId = ++uploadCount;
      const itemEl = document.createElement('div');
      itemEl.className = 'upload-item';
      itemEl.innerHTML = `
        <div class="upload-item-name">${escHtml(file.name)}</div>
        <div class="progress-bar-wrap"><div class="progress-bar" id="upload-bar-${uploadId}" style="width:0%"></div></div>
        <div class="text-xs text-muted" id="upload-status-${uploadId}">Uploading…</div>`;
      if (uploadItems) uploadItems.appendChild(itemEl);
      const progressBar = document.getElementById(`upload-bar-${uploadId}`);
      const statusEl    = document.getElementById(`upload-status-${uploadId}`);

      try {
        await StorjClient.uploadObject(file.name, file, pct => {
          if (progressBar) progressBar.style.width = pct + '%';
        });
        if (progressBar) { progressBar.style.width = '100%'; progressBar.classList.add('success'); }
        if (statusEl) statusEl.textContent = 'Done ✓';
        showToast(`"${file.name}" uploaded.`, 'success');
      } catch (e) {
        if (progressBar) progressBar.classList.add('danger');
        if (statusEl) statusEl.textContent = 'Failed: ' + e.message;
        showToast(`Upload failed: ${file.name} — ${e.message}`, 'error');
      }
    }

    await loadFiles();
    setTimeout(() => { if (uploadPanel) uploadPanel.classList.remove('active'); }, 2000);
  }

  // ── Drag & Drop ───────────────────────────────────────────────────────────
  let dragCounter = 0;
  function onDragEnter(e) {
    if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
      dragCounter++;
      if (dropOverlay) dropOverlay.classList.add('active');
    }
  }
  function onDragLeave() {
    dragCounter--;
    if (dragCounter <= 0) { dragCounter = 0; if (dropOverlay) dropOverlay.classList.remove('active'); }
  }
  function onDrop(e) {
    e.preventDefault();
    dragCounter = 0;
    if (dropOverlay) dropOverlay.classList.remove('active');
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) uploadFiles(files);
  }

  // ── Storage bar ───────────────────────────────────────────────────────────
  function updateStorageBar() {
    const totalBytes = allFiles.reduce((s, f) => s + f.size, 0);
    const creds      = Auth.getStorjCreds();
    const limitGB    = creds && creds.storageLimitGB ? parseFloat(creds.storageLimitGB) : 150;
    const limitBytes = limitGB * 1024 * 1024 * 1024;
    const pct        = Math.min(100, (totalBytes / limitBytes) * 100);

    if (storageText) storageText.textContent = `${StorjClient.formatSize(totalBytes)} / ${limitGB} GB`;
    if (storageBar)  {
      storageBar.style.width = pct + '%';
      storageBar.className   = 'progress-bar' + (pct > 90 ? ' danger' : pct > 70 ? ' warning' : '');
    }
  }

  // ── Search / sort ─────────────────────────────────────────────────────────
  function onSearch(e) {
    searchQuery = e.target.value.trim();
    applyFiltersAndSort();
    renderFiles();
  }

  function onSort(e) {
    sortMode = e.target.value;
    localStorage.setItem('kc_sort', sortMode);
    applyFiltersAndSort();
    renderFiles();
  }

  // ── View mode ─────────────────────────────────────────────────────────────
  function setViewMode(mode, save = true) {
    viewMode = mode;
    if (save) localStorage.setItem('kc_view', mode);
    if (viewGrid) viewGrid.classList.toggle('active', mode === 'grid');
    if (viewList) viewList.classList.toggle('active', mode === 'list');
    renderFiles();
  }

  // ── Sidebar (mobile) ──────────────────────────────────────────────────────
  function openSidebar()  {
    if (sidebar) sidebar.classList.add('open');
    if (sidebarOverlay) sidebarOverlay.classList.add('active');
  }
  function closeSidebar() {
    if (sidebar) sidebar.classList.remove('open');
    if (sidebarOverlay) sidebarOverlay.classList.remove('active');
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  function setLoading(on) {
    if (btnRefresh) {
      btnRefresh.disabled = on;
      btnRefresh.innerHTML = on
        ? '<span class="spinner"></span>'
        : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>';
    }
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  function showEmpty(msg, isError = false) {
    if (!fileContainer) return;
    fileContainer.innerHTML = '';
    if (emptyState) {
      emptyState.style.display = 'flex';
      const p = emptyState.querySelector('p');
      if (p) p.textContent = msg;
      emptyState.querySelector('h3').textContent = isError ? 'Connection Error' : 'No Files';
    }
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
  function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${escHtml(msg)}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  // ── HTML escape ───────────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ── Format date ───────────────────────────────────────────────────────────
  function formatDate(d) {
    if (!d || isNaN(d)) return '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  init();

})();
