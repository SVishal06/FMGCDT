'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';

export function ThemeToggle() {
  // false during SSR/hydration, true on the client: avoids an icon mismatch without an effect.
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const { setTheme, resolvedTheme } = useTheme();

  if (!mounted) return <div className="w-9 h-9" />;

  const isDark = resolvedTheme === 'dark';
  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="btn btn-secondary"
      style={{ width: 36, padding: 0 }}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Light theme' : 'Dark theme'}
    >
      <span className="material-symbols-outlined">{isDark ? 'light_mode' : 'dark_mode'}</span>
    </button>
  );
}
