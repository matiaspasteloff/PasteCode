import { describe, expect, it } from 'vitest';

import { InvalidToolCallError } from '../errors/ai-errors.js';

import { applyExactEdit, isReadOnlyTool, isToolName, parseToolArguments } from './tools.js';

describe('isToolName', () => {
  it('reconoce las herramientas que existen', () => {
    expect(isToolName('read_file')).toBe(true);
    expect(isToolName('create_file')).toBe(true);
  });

  it('rechaza lo que el modelo se haya inventado', () => {
    expect(isToolName('rm_rf')).toBe(false);
    expect(isToolName('')).toBe(false);
    expect(isToolName(42)).toBe(false);
    expect(isToolName(null)).toBe(false);
  });
});

describe('isReadOnlyTool', () => {
  it('marca como sólo lectura las tres que se resuelven en el main', () => {
    expect(isReadOnlyTool('list_files')).toBe(true);
    expect(isReadOnlyTool('read_file')).toBe(true);
    expect(isReadOnlyTool('search_workspace')).toBe(true);
  });

  it('marca como escritura las tres que tocan el disco', () => {
    expect(isReadOnlyTool('write_file')).toBe(false);
    expect(isReadOnlyTool('create_file')).toBe(false);
    // `apply_edit` no se agregó a `READ_ONLY_TOOLS`, así que cae de este lado
    // sin que haya que tocar el predicado. Ésa es la mitad del valor de que la
    // partición sea un dato y no un `switch`.
    expect(isReadOnlyTool('apply_edit')).toBe(false);
  });
});

describe('parseToolArguments', () => {
  it('valida y devuelve los argumentos de una herramienta', () => {
    expect(parseToolArguments('read_file', '{"path":"src/a.ts"}')).toEqual({
      path: 'src/a.ts',
    });
  });

  it('aplica los defaults declarados', () => {
    expect(parseToolArguments('list_files', '{}')).toEqual({ path: '' });
    expect(parseToolArguments('search_workspace', '{"query":"todo"}')).toEqual({
      query: 'todo',
      isRegex: false,
    });
  });

  it('trata la cadena vacía como un objeto sin argumentos', () => {
    // Es lo que manda un modelo que llama a una herramienta sin parámetros.
    expect(parseToolArguments('list_files', '')).toEqual({ path: '' });
  });

  it('rechaza el JSON roto con el error del proyecto, no con un SyntaxError', () => {
    expect(() => parseToolArguments('read_file', '{"path":')).toThrow(InvalidToolCallError);
  });

  it('rechaza cuando falta un argumento obligatorio', () => {
    expect(() => parseToolArguments('read_file', '{}')).toThrow(InvalidToolCallError);
  });

  it('rechaza los argumentos que el schema no declara', () => {
    // Estricto a propósito: un argumento inventado suele venir con una ruta
    // inventada al lado, y es mejor que el modelo lo reintente.
    expect(() => parseToolArguments('read_file', '{"path":"a","sudo":true}')).toThrow(
      InvalidToolCallError
    );
  });

  it('rechaza el tipo equivocado', () => {
    expect(() => parseToolArguments('read_file', '{"path":42}')).toThrow(InvalidToolCallError);
  });

  it('nombra el argumento que falló, para que el modelo pueda corregirlo', () => {
    expect(() => parseToolArguments('write_file', '{"path":"a"}')).toThrow(/content/);
  });

  it('acepta contenido vacío en una escritura: vaciar un archivo es válido', () => {
    expect(parseToolArguments('write_file', '{"path":"a.ts","content":""}')).toEqual({
      path: 'a.ts',
      content: '',
    });
  });
});

describe('parseToolArguments · apply_edit', () => {
  it('acepta un reemplazo exacto y le pone el default a replaceAll', () => {
    expect(
      parseToolArguments('apply_edit', '{"path":"a.ts","oldText":"uno","newText":"dos"}')
    ).toEqual({ path: 'a.ts', oldText: 'uno', newText: 'dos', replaceAll: false });
  });

  it('acepta newText vacío: borrar un fragmento es una edición válida', () => {
    expect(
      parseToolArguments('apply_edit', '{"path":"a.ts","oldText":"uno","newText":""}')
    ).toMatchObject({ newText: '' });
  });

  it('rechaza un oldText vacío', () => {
    // Coincide entre cada par de caracteres del archivo: no tiene ninguna
    // lectura útil, así que se corta en el schema y no más adelante.
    expect(() =>
      parseToolArguments('apply_edit', '{"path":"a.ts","oldText":"","newText":"x"}')
    ).toThrow(InvalidToolCallError);
  });
});

describe('applyExactEdit', () => {
  it('reemplaza la única aparición', () => {
    expect(
      applyExactEdit('const a = 1;', { oldText: '1', newText: '2', replaceAll: false })
    ).toEqual({ ok: true, content: 'const a = 2;', replacements: 1 });
  });

  it('avisa cuando el fragmento no aparece, en vez de escribir cualquier cosa', () => {
    expect(
      applyExactEdit('hola', { oldText: 'chau', newText: 'x', replaceAll: false })
    ).toEqual({ ok: false, reason: 'not-found', occurrences: 0 });
  });

  it('falla ante una coincidencia ambigua en vez de elegir la primera', () => {
    // Dos apariciones iguales significan que el modelo no miró suficiente
    // contexto, y elegir por él es elegir mal la mitad de las veces.
    expect(applyExactEdit('a b a', { oldText: 'a', newText: 'c', replaceAll: false })).toEqual({
      ok: false,
      reason: 'ambiguous',
      occurrences: 2,
    });
  });

  it('reemplaza todas cuando se lo piden explícitamente', () => {
    expect(applyExactEdit('a b a', { oldText: 'a', newText: 'c', replaceAll: true })).toEqual({
      ok: true,
      content: 'c b c',
      replacements: 2,
    });
  });

  it('compara literal y no como expresión regular', () => {
    // `oldText` viene del modelo: un `.` o un `(` tratados como metacaracteres
    // harían que el reemplazo toque un lugar que nadie pidió.
    expect(
      applyExactEdit('a.b acb', { oldText: 'a.b', newText: 'ok', replaceAll: false })
    ).toEqual({ ok: true, content: 'ok acb', replacements: 1 });
  });

  it('conserva los saltos de línea del fragmento', () => {
    expect(
      applyExactEdit('uno\ndos\ntres', {
        oldText: 'dos\ntres',
        newText: 'DOS',
        replaceAll: false,
      })
    ).toMatchObject({ ok: true, content: 'uno\nDOS' });
  });
});
