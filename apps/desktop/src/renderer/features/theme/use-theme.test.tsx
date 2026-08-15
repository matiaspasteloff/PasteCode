import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useThemeStore } from '../../stores/theme-store.js';

import { useTheme } from './use-theme.js';

/** Componente mínimo cuyo único trabajo es aplicar el tema. */
function ThemeHost(): React.JSX.Element {
  useTheme();

  return <div data-testid="host" />;
}

/** Listeners registrados sobre el media query, para poder dispararlos. */
let listeners: (() => void)[] = [];

/** Instala un `matchMedia` que dice si el sistema está en oscuro. */
function installMatchMedia(prefersDark: boolean): void {
  listeners = [];

  Object.defineProperty(globalThis, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: prefersDark,
      media: query,
      addEventListener: (_type: string, listener: () => void) => listeners.push(listener),
      removeEventListener: () => undefined,
    }),
  });
}

beforeEach(() => {
  useThemeStore.setState({ theme: 'system' });
  installMatchMedia(false);
});

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

describe('useTheme', () => {
  it('sigue al sistema en claro', () => {
    installMatchMedia(false);

    render(<ThemeHost />);

    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('sigue al sistema en oscuro', () => {
    // RF-802 sin una línea de IPC: matchMedia en el renderer ya sabe qué
    // prefiere el sistema operativo.
    installMatchMedia(true);

    render(<ThemeHost />);

    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('la elección explícita le gana al sistema', () => {
    installMatchMedia(true);
    useThemeStore.setState({ theme: 'light' });

    render(<ThemeHost />);

    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('cambia en caliente al cambiar la preferencia', () => {
    const { rerender } = render(<ThemeHost />);
    expect(document.documentElement.dataset.theme).toBe('light');

    useThemeStore.setState({ theme: 'dark' });
    rerender(<ThemeHost />);

    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('reacciona a un cambio del sistema mientras está en system', () => {
    let prefersDark = false;
    installMatchMedia(false);
    Object.defineProperty(globalThis, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        get matches() {
          return prefersDark;
        },
        media: query,
        addEventListener: (_type: string, listener: () => void) => listeners.push(listener),
        removeEventListener: () => undefined,
      }),
    });

    render(<ThemeHost />);
    prefersDark = true;
    for (const listener of listeners) listener();

    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('no escucha al sistema cuando el tema es explícito', () => {
    useThemeStore.setState({ theme: 'light' });

    render(<ThemeHost />);

    expect(listeners).toHaveLength(0);
  });
});

describe('cycleTheme', () => {
  it('rota entre las tres opciones y vuelve al principio', () => {
    const cycle = useThemeStore.getState().cycleTheme;
    const seen: string[] = [];

    for (let step = 0; step < 4; step += 1) {
      seen.push(useThemeStore.getState().theme);
      cycle();
    }

    expect(seen).toEqual(['system', 'light', 'dark', 'system']);
  });
});
