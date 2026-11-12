import { describe, expect, it } from 'vitest';

import { toKeyCombination } from './key-combination.js';

/** Un `keydown` con los modificadores que se le pidan. */
function keydown(key: string, modifiers: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, ...modifiers });
}

describe('toKeyCombination', () => {
  it('arma la combinación con los modificadores en orden fijo', () => {
    const event = keydown('P', { shiftKey: true, ctrlKey: true });

    expect(toKeyCombination(event, 'win32')).toBe('ctrl+shift+p');
  });

  it('no produce nada cuando sólo se pulsa un modificador', () => {
    expect(toKeyCombination(keydown('Control', { ctrlKey: true }), 'win32')).toBeUndefined();
    expect(toKeyCombination(keydown('Meta', { metaKey: true }), 'darwin')).toBeUndefined();
  });

  it('en Windows y Linux, la tecla Windows/Super es `meta` y no `ctrl`', () => {
    expect(toKeyCombination(keydown('s', { metaKey: true }), 'win32')).toBe('meta+s');
    expect(toKeyCombination(keydown('s', { metaKey: true }), 'linux')).toBe('meta+s');
  });

  it('en macOS, Cmd cuenta como `ctrl`', () => {
    expect(toKeyCombination(keydown('s', { metaKey: true }), 'darwin')).toBe('ctrl+s');
    expect(toKeyCombination(keydown('P', { metaKey: true, shiftKey: true }), 'darwin')).toBe(
      'ctrl+shift+p'
    );
  });

  it('en macOS, Control también es `ctrl`, y con Cmd a la vez no se duplica', () => {
    expect(toKeyCombination(keydown('s', { ctrlKey: true }), 'darwin')).toBe('ctrl+s');
    expect(toKeyCombination(keydown('s', { ctrlKey: true, metaKey: true }), 'darwin')).toBe(
      'ctrl+s'
    );
  });
});
