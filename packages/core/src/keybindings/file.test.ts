import { describe, expect, it } from 'vitest';

import { KeybindingsFileSchema, normalizeKey, userKeybindings } from './file.js';

describe('normalizeKey', () => {
  it('pasa todo a minúsculas', () => {
    expect(normalizeKey('Ctrl+Shift+P')).toBe('ctrl+shift+p');
  });

  it('ordena los modificadores como los escribe el renderer', () => {
    // El resolver compara las teclas por igualdad de cadena, así que un orden
    // distinto no da un error: da un atajo que no dispara nunca.
    expect(normalizeKey('shift+ctrl+p')).toBe('ctrl+shift+p');
    expect(normalizeKey('alt+ctrl+shift+k')).toBe('ctrl+shift+alt+k');
  });

  it('tolera espacios alrededor de las partes', () => {
    expect(normalizeKey(' Ctrl + K ')).toBe('ctrl+k');
  });

  it('deja pasar una tecla sin modificadores', () => {
    expect(normalizeKey('F2')).toBe('f2');
  });

  it('no inventa partes con un separador de más', () => {
    expect(normalizeKey('ctrl++')).toBe('ctrl');
  });
});

describe('KeybindingsFileSchema', () => {
  it('acepta una lista de atajos', () => {
    const parsed = KeybindingsFileSchema.parse([
      { key: 'ctrl+k', command: 'file.save' },
      { key: 'ctrl+j', command: 'terminal.toggle', when: 'hasWorkspace' },
    ]);

    expect(parsed).toHaveLength(2);
  });

  it('acepta un archivo vacío', () => {
    expect(KeybindingsFileSchema.parse([])).toEqual([]);
  });

  it('rechaza una clave que no existe', () => {
    // `comand` en vez de `command` es el error de tipeo que deja a alguien
    // mirando por qué su atajo no hace nada. Que falle es el punto.
    expect(() =>
      KeybindingsFileSchema.parse([{ key: 'ctrl+k', comand: 'file.save' }])
    ).toThrow();
  });

  it('rechaza un atajo sin comando', () => {
    expect(() => KeybindingsFileSchema.parse([{ key: 'ctrl+k' }])).toThrow();
  });

  it('rechaza algo que no es una lista', () => {
    expect(() => KeybindingsFileSchema.parse({ 'ctrl+k': 'file.save' })).toThrow();
  });
});

describe('userKeybindings', () => {
  it('normaliza las teclas', () => {
    expect(userKeybindings([{ key: 'Ctrl+Shift+P', command: 'palette.open' }])).toEqual([
      { key: 'ctrl+shift+p', command: 'palette.open' },
    ]);
  });

  it('conserva el when cuando vino', () => {
    expect(
      userKeybindings([{ key: 'Ctrl+K', command: 'file.save', when: 'editorFocus' }])
    ).toEqual([{ key: 'ctrl+k', command: 'file.save', when: 'editorFocus' }]);
  });

  it('omite el when en vez de ponerlo en undefined', () => {
    // Con `exactOptionalPropertyTypes` no es lo mismo, y el resolver pregunta
    // por `binding.when === undefined` para decidir si el atajo aplica siempre.
    const [binding] = userKeybindings([{ key: 'ctrl+k', command: 'file.save' }]);

    expect(binding !== undefined && 'when' in binding).toBe(false);
  });
});
