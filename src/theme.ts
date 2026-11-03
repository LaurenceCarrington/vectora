import {initializeAccentControls} from './accentColour';
export type Theme = 'dark' | 'light';
export function currentTheme(): Theme {
  const theme = document.documentElement.dataset.theme;
  return theme === 'dark' ? theme : 'light';
}
export function initializeThemeControls(onChange: () => void = () => {}): void {
  const controls = [...document.querySelectorAll<HTMLInputElement>('[name="appearance-theme"]')];
  const toggles = [...document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]')];
  const choices = ['light','dark','system'];
  const applyAccent = initializeAccentControls(onChange);
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  let choice = 'system';
  try {
    const saved = localStorage.getItem('vectora.theme');
    if (saved === 'light' || saved === 'dark') choice = saved;
    else if (saved === 'high-contrast') { choice = 'light'; localStorage.setItem('vectora.theme', choice); }
  } catch { /* Follow the system when preferences are unavailable. */ }
  const apply = () => {
    const theme = choice === 'system' ? (media.matches ? 'dark' : 'light') : choice;
    document.documentElement.dataset.theme = theme;
    applyAccent();
    controls.forEach(control => { control.checked = control.value === choice; });
    const next = choices[(choices.indexOf(choice) + 1) % choices.length];
    const label = (value:string) => value[0].toUpperCase() + value.slice(1);
    toggles.forEach(button => {
      const title = `Theme: ${label(choice)}. Switch to ${label(next)}`;
      button.setAttribute('aria-label', title); button.title = title; button.dataset.themeChoice = choice;
      button.querySelector('use')?.setAttribute('href', `#i-theme-${choice}`);
    });
    onChange();
  };
  const select = (value:string) => {
    choice = value;
    try { localStorage.setItem('vectora.theme', choice); } catch { /* Keep the session preference. */ }
    apply();
  };
  toggles.forEach(button => {
    button.addEventListener('click', () => select(choices[(choices.indexOf(choice) + 1) % choices.length]));
    for (const type of ['keydown','keyup'] as const) button.addEventListener(type, event => {
      if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
    });
  });
  for (const control of controls) {
    control.addEventListener('change', () => {
      if (!control.checked) return;
      select(control.value);
    });
  }
  media.addEventListener('change', () => { if (choice === 'system') apply(); });
  apply();
}
