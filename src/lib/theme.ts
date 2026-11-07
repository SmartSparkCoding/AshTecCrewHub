import { useEffect, useState } from 'react';

/**
 * Appearance is a per-device setting, not a crew-wide one.
 *
 * The hub used to force dark mode on every screen. That is still the default,
 * but the choice now lives in localStorage so a projector in the hall can be
 * light while a phone stays dark. Nothing here touches the database.
 */
export type Theme = 'dark' | 'light' | 'system';

const KEY = 'ashtec-theme';

export function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === 'dark' || stored === 'light' || stored === 'system') return stored;
  } catch {
    // Private mode, or storage turned off. Dark is the house style.
  }
  return 'dark';
}

const prefersLight = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches;

export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && !prefersLight());
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // Not being able to remember the choice is not worth an error.
    }
    if (theme !== 'system') return;
    // Follow the OS while "system" is picked.
    const mq = window.matchMedia?.('(prefers-color-scheme: light)');
    if (!mq) return;
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  return { theme, setTheme: setThemeState };
}
