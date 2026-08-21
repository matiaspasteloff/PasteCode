import { describe, expect, it } from 'vitest';

import { InvalidToolCallError } from '../errors/ai-errors.js';

import { AI_TOOLS, isReadOnlyTool, isToolName, parseToolArguments } from './tools.js';

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

  it('marca como escritura las dos que necesitan confirmación', () => {
    expect(isReadOnlyTool('write_file')).toBe(false);
    expect(isReadOnlyTool('create_file')).toBe(false);
  });
});

describe('AI_TOOLS', () => {
  it('declara una definición por herramienta, sin repetir nombres', () => {
    const names = AI_TOOLS.map((tool) => tool.function.name);

    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('write_file');
  });

  it('le explica al modelo que las de escritura no escriben', () => {
    // Es la única forma de decírselo: si la descripción no lo dice, el modelo
    // asume que write_file escribió y sigue como si el archivo ya estuviera.
    const write = AI_TOOLS.find((tool) => tool.function.name === 'write_file');

    expect(write?.function.description).toContain('NO escribe');
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
