import { describe, expect, it } from 'vitest';

import { findConflicts, resolveKeybinding, type Keybinding } from './resolver.js';

describe('resolveKeybinding', () => {
  it('resuelve un binding simple cuando el contexto coincide', () => {
    const bindings = [{ key: 'ctrl+s', command: 'file.save', when: 'editorFocus' }];

    const result = resolveKeybinding(bindings, 'ctrl+s', { editorFocus: true });

    expect(result).toEqual({ command: 'file.save' });
  });

  it('devuelve null cuando la cláusula when no se cumple', () => {
    const bindings = [{ key: 'ctrl+s', command: 'file.save', when: 'editorFocus' }];

    const result = resolveKeybinding(bindings, 'ctrl+s', { editorFocus: false });

    expect(result).toBeNull();
  });

  it('prioriza el binding más específico ante conflicto', () => {
    // Es el ejemplo textual de convenciones/testing.md.
    const bindings = [
      { key: 'ctrl+f', command: 'editor.find', when: 'editorFocus' },
      { key: 'ctrl+f', command: 'terminal.find', when: 'editorFocus && terminalFocus' },
    ];

    const result = resolveKeybinding(bindings, 'ctrl+f', {
      editorFocus: true,
      terminalFocus: true,
    });

    expect(result).toEqual({ command: 'terminal.find' });
  });

  it('aplica siempre un binding sin when', () => {
    const bindings = [{ key: 'ctrl+shift+p', command: 'palette.open' }];

    expect(resolveKeybinding(bindings, 'ctrl+shift+p', {})).toEqual({
      command: 'palette.open',
    });
  });

  it('le gana el que tiene when al que no lo tiene', () => {
    const bindings = [
      { key: 'ctrl+s', command: 'generico' },
      { key: 'ctrl+s', command: 'especifico', when: 'editorFocus' },
    ];

    expect(resolveKeybinding(bindings, 'ctrl+s', { editorFocus: true })).toEqual({
      command: 'especifico',
    });
  });

  it('cae al genérico cuando el específico no aplica', () => {
    const bindings = [
      { key: 'ctrl+s', command: 'generico' },
      { key: 'ctrl+s', command: 'especifico', when: 'editorFocus' },
    ];

    expect(resolveKeybinding(bindings, 'ctrl+s', { editorFocus: false })).toEqual({
      command: 'generico',
    });
  });

  it('ante la misma especificidad gana el último, que es el del usuario', () => {
    // Los de fábrica se cargan primero justamente para que el archivo del
    // usuario pueda pisarlos.
    const bindings = [
      { key: 'ctrl+s', command: 'de.fabrica', when: 'editorFocus' },
      { key: 'ctrl+s', command: 'del.usuario', when: 'editorFocus' },
    ];

    expect(resolveKeybinding(bindings, 'ctrl+s', { editorFocus: true })).toEqual({
      command: 'del.usuario',
    });
  });

  it('devuelve null cuando ninguna tecla coincide', () => {
    const bindings = [{ key: 'ctrl+s', command: 'file.save' }];

    expect(resolveKeybinding(bindings, 'ctrl+q', {})).toBeNull();
  });

  it('devuelve null con una lista vacía', () => {
    expect(resolveKeybinding([], 'ctrl+s', {})).toBeNull();
  });

  it('descarta un when inválido en vez de dejar la app sin teclado', () => {
    // Un archivo de keybindings del usuario con un error de tipeo no puede
    // romper el resto de los atajos.
    const bindings = [
      { key: 'ctrl+s', command: 'roto', when: '&& ||' },
      { key: 'ctrl+s', command: 'sano' },
    ];

    expect(resolveKeybinding(bindings, 'ctrl+s', {})).toEqual({ command: 'sano' });
  });
});

describe('findConflicts', () => {
  it('no reporta nada cuando las teclas son distintas', () => {
    const bindings: Keybinding[] = [
      { key: 'ctrl+s', command: 'file.save' },
      { key: 'ctrl+p', command: 'quick.open' },
    ];

    expect(findConflicts(bindings)).toEqual([]);
  });

  it('reporta dos comandos con la misma tecla y sin condición', () => {
    const bindings: Keybinding[] = [
      { key: 'ctrl+s', command: 'file.save' },
      { key: 'ctrl+s', command: 'otro.save' },
    ];

    expect(findConflicts(bindings)).toEqual([
      { key: 'ctrl+s', commands: ['file.save', 'otro.save'] },
    ]);
  });

  it('reporta dos comandos con la misma tecla y la misma condición', () => {
    const bindings: Keybinding[] = [
      { key: 'ctrl+f', command: 'a', when: 'editorFocus' },
      { key: 'ctrl+f', command: 'b', when: 'editorFocus' },
    ];

    expect(findConflicts(bindings)).toHaveLength(1);
  });

  it('no reporta conflicto cuando las condiciones difieren', () => {
    // Con condiciones distintas el desempate por especificidad ya decide;
    // avisar de esto sería ruido en cada arranque.
    const bindings: Keybinding[] = [
      { key: 'ctrl+f', command: 'editor.find', when: 'editorFocus' },
      { key: 'ctrl+f', command: 'terminal.find', when: 'terminalFocus' },
    ];

    expect(findConflicts(bindings)).toEqual([]);
  });

  it('acepta una lista vacía', () => {
    expect(findConflicts([])).toEqual([]);
  });
});
