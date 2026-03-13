/**
 * KingCloud - Theme Manager
 * Applies and persists user theme preferences across all pages.
 */

const Theme = (() => {
  const KEY_THEME    = 'kc_theme';
  const KEY_FONTSIZE = 'kc_fontsize';
  const KEY_COMPACT  = 'kc_compact';

  const THEMES = ['light', 'dark', 'midnight', 'forest', 'sunset', 'rose'];

  function getTheme()    { return localStorage.getItem(KEY_THEME)    || 'light'; }
  function getFontSize() { return localStorage.getItem(KEY_FONTSIZE) || 'medium'; }
  function getCompact()  { return localStorage.getItem(KEY_COMPACT)  === 'true'; }

  function applyTheme(theme) {
    if (!THEMES.includes(theme)) theme = 'light';
    if (theme === 'light') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    localStorage.setItem(KEY_THEME, theme);
    // Sync any theme-select elements on the page
    document.querySelectorAll('[data-theme-select]').forEach(el => { el.value = theme; });
    document.querySelectorAll('.theme-option').forEach(el => {
      el.classList.toggle('active', el.dataset.themeValue === theme);
    });
  }

  function applyFontSize(size) {
    const sizes = ['small', 'medium', 'large'];
    if (!sizes.includes(size)) size = 'medium';
    document.documentElement.setAttribute('data-fontsize', size);
    localStorage.setItem(KEY_FONTSIZE, size);
    document.querySelectorAll('.fontsize-option').forEach(el => {
      el.classList.toggle('active', el.dataset.fontsizeValue === size);
    });
  }

  function applyCompact(on) {
    document.documentElement.setAttribute('data-compact', on ? 'true' : 'false');
    localStorage.setItem(KEY_COMPACT, on ? 'true' : 'false');
  }

  function init() {
    applyTheme(getTheme());
    applyFontSize(getFontSize());
    applyCompact(getCompact());
  }

  // Call init immediately so the theme is applied before any rendering
  init();

  return { init, applyTheme, applyFontSize, applyCompact, getTheme, getFontSize, getCompact, THEMES };
})();
