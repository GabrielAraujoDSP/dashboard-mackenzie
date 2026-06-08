const THEMES = ['theme-light', 'theme-dark', 'theme-contrast'];
const THEME_LABELS = { 'theme-light': 'Claro', 'theme-dark': 'Escuro', 'theme-contrast': 'Alto Contraste' };

function initTheme() {
  const saved = localStorage.getItem('dashboard-theme') || 'theme-dark';
  applyTheme(saved);
}

function applyTheme(theme) {
  document.documentElement.classList.remove(...THEMES);
  document.documentElement.classList.add(theme);
  localStorage.setItem('dashboard-theme', theme);
  document.querySelectorAll('.btn-theme').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
  // Re-render charts so tick/label colors update to match new theme
  if (typeof onFiltersChange === 'function' && typeof STATE !== 'undefined' && STATE.filtered && STATE.filtered.length > 0) {
    onFiltersChange();
  }
}

function cycleTheme() {
  const current = THEMES.find(t => document.documentElement.classList.contains(t)) || 'theme-dark';
  const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
  applyTheme(next);
}
