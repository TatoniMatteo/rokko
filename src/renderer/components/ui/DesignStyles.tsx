import { useLayoutEffect } from 'react';
import snapshot from '../../styles/generated/figcraft.json';
import { themeTokens } from '../../../shared/preferences/theme.mjs';

export function DesignStyles({ seed, dark }: { seed: string; dark: boolean }) {
  useLayoutEffect(() => {
    const palette = { ...themeTokens(seed, dark), 'accent-hover': 'color-mix(in srgb,var(--accent) 90%,var(--text))', ...(seed.toLowerCase() === '#245dc5' ? snapshot.palettes[dark ? 'dark' : 'light'] : {}) };
    for (const [key, value] of Object.entries(palette)) document.documentElement.style.setProperty('--' + key, value);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- Vite replaces this saved snapshot during HMR.
  }, [seed, dark, snapshot.sourceHash]);
  return <style data-figcraft-snapshot={snapshot.sourceHash}>{snapshot.css}</style>;
}
