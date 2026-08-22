import { describe, expect, it } from 'vitest';

import { AI_TOOLS } from './tool-definitions.js';
import { AI_TOOL_NAMES } from './tools.js';

describe('AI_TOOLS', () => {
  it('declara una definición por herramienta, sin repetir nombres', () => {
    const names = AI_TOOLS.map((tool) => tool.function.name);

    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual([...AI_TOOL_NAMES].sort());
  });

  it('le explica al modelo que apply_edit exige un fragmento único', () => {
    // Es la única forma de decírselo: sin esto el modelo manda un `oldText`
    // que aparece tres veces y la herramienta le falla una y otra vez.
    const edit = AI_TOOLS.find((tool) => tool.function.name === 'apply_edit');

    expect(edit?.function.description).toContain('una sola vez');
  });

  it('no afirma en la descripción si las de escritura escriben o no', () => {
    // Depende del modo, y lo dice el prompt de sistema. Una descripción que lo
    // afirmara sería falsa en dos de los tres modos.
    const write = AI_TOOLS.find((tool) => tool.function.name === 'write_file');

    expect(write?.function.description).not.toContain('NO escribe');
  });

  it('empuja al modelo hacia apply_edit antes que a reescribir el archivo entero', () => {
    // Con modelos gratuitos, pedir el contenido final completo de un archivo
    // mediano falla seguido y quema cuota.
    const write = AI_TOOLS.find((tool) => tool.function.name === 'write_file');

    expect(write?.function.description).toContain('apply_edit');
  });
});
