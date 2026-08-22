import { describe, expect, it } from 'vitest';

import {
  AI_CHAT_MODES,
  canWriteInMode,
  maxTurnsForMode,
  modeInstructions,
  toolsForMode,
} from './modes.js';
import { AI_TOOLS } from './tool-definitions.js';

/** Los nombres de las herramientas que un modo le declara al modelo. */
function toolNames(mode: 'ask' | 'plan' | 'agent'): string[] {
  return toolsForMode(mode).map((tool) => tool.function.name);
}

describe('AI_CHAT_MODES', () => {
  it('declara los tres modos como dato recorrible y no como enum', () => {
    // La lista tiene que poder recorrerse: es lo que dibuja el selector.
    expect([...AI_CHAT_MODES]).toEqual(['ask', 'plan', 'agent']);
  });
});

describe('toolsForMode', () => {
  it('le declara a ask sólo las tres de lectura', () => {
    // **No es cosmético.** Un modelo no puede llamar a una herramienta que no
    // está en la request: ésta es la barrera que impide que `ask` escriba.
    expect(toolNames('ask')).toEqual(['list_files', 'read_file', 'search_workspace']);
  });

  it('le declara a plan exactamente las mismas que a ask', () => {
    expect(toolNames('plan')).toEqual(toolNames('ask'));
  });

  it('le declara al agente las seis, con las tres de escritura', () => {
    expect(toolNames('agent')).toHaveLength(AI_TOOLS.length);
    expect(toolNames('agent')).toContain('apply_edit');
    expect(toolNames('agent')).toContain('write_file');
    expect(toolNames('agent')).toContain('create_file');
  });

  it('no le da a ask ni a plan ninguna herramienta de escritura', () => {
    for (const mode of ['ask', 'plan'] as const) {
      expect(toolNames(mode)).not.toContain('write_file');
      expect(toolNames(mode)).not.toContain('create_file');
      expect(toolNames(mode)).not.toContain('apply_edit');
    }
  });
});

describe('canWriteInMode', () => {
  it('es verdadero sólo en modo agente', () => {
    expect(canWriteInMode('agent')).toBe(true);
    expect(canWriteInMode('ask')).toBe(false);
    expect(canWriteInMode('plan')).toBe(false);
  });
});

describe('maxTurnsForMode', () => {
  it('le da más vueltas al agente que a los otros dos', () => {
    // Llevar un cambio hasta el final es leer, editar, releer y corregir;
    // responder una pregunta son unas lecturas.
    expect(maxTurnsForMode('agent')).toBeGreaterThan(maxTurnsForMode('plan'));
    expect(maxTurnsForMode('plan')).toBeGreaterThan(maxTurnsForMode('ask'));
  });
});

describe('modeInstructions', () => {
  it('le prohíbe a plan decir que hizo algo', () => {
    expect(modeInstructions('plan')).toContain('prohibido');
  });

  it('le dice al agente que las herramientas escriben de verdad', () => {
    // Sin esto el modelo razona sobre la realidad de ADR-0029, donde las
    // herramientas de escritura proponen y no escriben.
    expect(modeInstructions('agent')).toContain('escriben de verdad');
  });

  it('mantiene la defensa contra prompt injection en el modo que escribe solo', () => {
    expect(modeInstructions('agent')).toContain('orden');
  });

  it('le da a cada modo un texto propio', () => {
    const texts = AI_CHAT_MODES.map((mode) => modeInstructions(mode));

    expect(new Set(texts).size).toBe(AI_CHAT_MODES.length);
  });
});
