import { CapabilityDeniedError } from '@pastecode/core';
import { describe, expect, it } from 'vitest';

import { assertCapability } from './capabilities.js';

describe('assertCapability', () => {
  it('deja pasar lo que el manifest declaró', () => {
    expect(() => {
      assertCapability('word-count', ['statusBar', 'documentRead'], 'documentRead');
    }).not.toThrow();
  });

  it('rechaza con CAPABILITY_DENIED lo que no se declaró', () => {
    expect(() => {
      assertCapability('word-count', ['documentRead'], 'documentWrite');
    }).toThrow(expect.objectContaining({ code: 'CAPABILITY_DENIED' }));
  });

  it('nombra la extensión y la capability en el mensaje para la persona', () => {
    // Quien lee esto es quien escribió la extensión: tiene que poder arreglarlo
    // en un renglón del manifest sin abrir el código del host.
    let shown = '';

    try {
      assertCapability('word-count', [], 'network');
    } catch (cause) {
      if (cause instanceof CapabilityDeniedError) shown = cause.userMessage;
    }

    expect(shown).toContain('word-count');
    expect(shown).toContain('network');
  });

  it('una extensión sin capabilities no puede nada', () => {
    expect(() => {
      assertCapability('theme-nord', [], 'statusBar');
    }).toThrow();
  });
});
