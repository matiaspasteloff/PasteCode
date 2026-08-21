import { describe, expect, it } from 'vitest';

import { shortcutLabel } from './shortcut-label.js';

describe('shortcutLabel', () => {
  it('formatea un atajo de fábrica con mayúsculas y nombres legibles', () => {
    expect(shortcutLabel('file.save', [])).toBe('Ctrl+S');
    expect(shortcutLabel('palette.open', [])).toBe('Ctrl+Shift+P');
  });

  it('devuelve vacío para un comando sin atajo', () => {
    expect(shortcutLabel('workspace.open', [])).toBe('');
  });

  it('deja que el atajo del usuario pise al de fábrica', () => {
    // Es la misma regla que aplica `resolveKeybinding` al resolver una tecla:
    // ante la misma especificidad gana el último declarado. Sin esto, el menú
    // mostraría un atajo que ya no dispara nada.
    expect(shortcutLabel('file.save', [{ key: 'ctrl+alt+g', command: 'file.save' }])).toBe(
      'Ctrl+Alt+G'
    );
  });

  it('muestra un acorde con un espacio entre las dos combinaciones', () => {
    expect(
      shortcutLabel('view.selectTheme', [{ key: 'ctrl+k ctrl+t', command: 'view.selectTheme' }])
    ).toBe('Ctrl+K Ctrl+T');
  });

  it('traduce las teclas especiales en vez de mostrar su nombre crudo', () => {
    expect(shortcutLabel('x', [{ key: 'escape', command: 'x' }])).toBe('Esc');
    expect(shortcutLabel('x', [{ key: 'ctrl+arrowup', command: 'x' }])).toBe('Ctrl+↑');
  });

  it('deja pasar tal cual una tecla que no tiene nombre especial', () => {
    expect(shortcutLabel('x', [{ key: 'f5', command: 'x' }])).toBe('f5');
  });

  it('conserva el backtick, que es un carácter y no un nombre', () => {
    expect(shortcutLabel('terminal.toggle', [])).toBe('Ctrl+`');
  });
});
