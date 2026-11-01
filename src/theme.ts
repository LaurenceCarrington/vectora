export type Theme = 'dark' | 'light' | 'high-contrast';
export function currentTheme(): Theme {
  const theme = document.documentElement.dataset.theme;
  return theme === 'dark' || theme === 'high-contrast' ? theme : 'light';
}
export function initializeThemeControls(onChange: () => void = () => {}): void {
  const controls = [...document.querySelectorAll<HTMLInputElement>('[name="appearance-theme"]')];
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  let choice = 'system';
  try {
    const saved = localStorage.getItem('vectora.theme');
    if (saved === 'light' || saved === 'dark' || saved === 'high-contrast') choice = saved;
  } catch { /* Follow the system when preferences are unavailable. */ }
  const apply = () => {
    const theme = choice === 'system' ? (media.matches ? 'dark' : 'light') : choice;
    if (document.documentElement.dataset.theme === theme) return;
    document.documentElement.dataset.theme = theme;
    onChange();
  };
  for (const control of controls) {
    control.checked = control.value === choice;
    control.addEventListener('change', () => {
      if (!control.checked) return;
      choice = control.value;
      try { localStorage.setItem('vectora.theme', choice); } catch { /* Keep the session preference. */ }
      apply();
    });
  }
  media.addEventListener('change', () => { if (choice === 'system') apply(); });
  apply();
}
