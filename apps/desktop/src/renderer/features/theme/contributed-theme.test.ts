import { beforeEach, describe, expect, it } from 'vitest';

import { applyContributedTheme, clearContributedTheme } from './contributed-theme.js';

/** Un tema mínimo, con lo que se le quiera cambiar. */
function themeWith(
  colors: Record<string, string>
): Parameters<typeof applyContributedTheme>[0] {
  return {
    id: 'nord',
    label: 'Nord',
    uiTheme: 'dark',
    extension: 'theme-nord',
    colors,
    tokenColors: [],
  };
}

beforeEach(() => {
  document.documentElement.removeAttribute('style');
  delete document.documentElement.dataset.theme;
});

describe('applyContributedTheme', () => {
  it('escribe los colores como variables CSS sobre el documento', () => {
    applyContributedTheme(themeWith({ background: '#2e3440', accent: '#88c0d0' }));

    const { style } = document.documentElement;

    expect(style.getPropertyValue('--color-background')).toBe('#2e3440');
    expect(style.getPropertyValue('--color-accent')).toBe('#88c0d0');
  });

  it('deja puesta la base para que se herede lo que el tema no pisa', () => {
    // Un tema que sólo cambia el acento tiene que seguir siendo legible: el
    // resto de los tokens salen del claro o del oscuro de fábrica.
    applyContributedTheme(themeWith({ accent: '#88c0d0' }));

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.getPropertyValue('--color-background')).toBe('');
  });
});

describe('clearContributedTheme', () => {
  it('saca todo lo que había puesto el tema anterior', () => {
    applyContributedTheme(themeWith({ background: '#2e3440', accent: '#88c0d0' }));
    clearContributedTheme('light');

    expect(document.documentElement.getAttribute('style')).toBe('');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('no deja mezclados los tokens de dos temas distintos', () => {
    // El tema anterior pudo definir tokens que el nuevo no toca. Sin limpiar,
    // quedarían puestos y las dos paletas se mezclarían.
    applyContributedTheme(themeWith({ background: '#2e3440', warning: '#ebcb8b' }));
    clearContributedTheme('dark');
    applyContributedTheme(themeWith({ background: '#111111' }));

    expect(document.documentElement.style.getPropertyValue('--color-warning')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--color-background')).toBe(
      '#111111'
    );
  });
});
