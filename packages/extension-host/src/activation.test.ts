import { describe, expect, it } from 'vitest';

import { matchesActivation } from './activation.js';

describe('matchesActivation', () => {
  it('activa por el fin del arranque', () => {
    expect(matchesActivation(['onStartupFinished'], { kind: 'startupFinished' })).toBe(true);
  });

  it('activa por el comando exacto', () => {
    expect(
      matchesActivation(['onCommand:wordCount.toggle'], {
        kind: 'command',
        id: 'wordCount.toggle',
      })
    ).toBe(true);
  });

  it('no activa por un prefijo del comando', () => {
    // Un match laxo despertaría a la extensión con comandos que no son suyos, y
    // despertarse cuesta cargar y ejecutar código de terceros.
    expect(
      matchesActivation(['onCommand:wordCount'], { kind: 'command', id: 'wordCount.toggle' })
    ).toBe(false);
  });

  it('activa por el lenguaje del documento', () => {
    expect(
      matchesActivation(['onLanguage:markdown'], { kind: 'language', languageId: 'markdown' })
    ).toBe(true);
  });

  it('no cruza tipos de evento entre sí', () => {
    expect(
      matchesActivation(['onLanguage:markdown'], { kind: 'command', id: 'markdown' })
    ).toBe(false);
    expect(
      matchesActivation(['onStartupFinished'], { kind: 'language', languageId: 'x' })
    ).toBe(false);
  });

  it('alcanza con que uno de los eventos declarados responda', () => {
    expect(
      matchesActivation(['onStartupFinished', 'onLanguage:python'], {
        kind: 'language',
        languageId: 'python',
      })
    ).toBe(true);
  });

  it('una extensión sin activation events no se activa por nada', () => {
    // Es el caso de un tema: contribuye sin código, así que no hay nada que
    // activar.
    expect(matchesActivation([], { kind: 'startupFinished' })).toBe(false);
  });
});
