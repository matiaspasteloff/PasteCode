import { describe, expect, it } from 'vitest';

import type { IndexedFile } from './file-search.js';
import { rankFiles } from './file-search.js';

/** Un archivo del índice, a partir de su ruta relativa. */
function file(relativePath: string): IndexedFile {
  return { path: `C:\\p\\${relativePath.replaceAll('/', '\\')}`, relativePath };
}

/** Las rutas relativas del resultado, que es lo que se compara. */
function ranked(query: string, files: readonly IndexedFile[], limit = 50): string[] {
  return rankFiles(query, files, limit).map((entry) => entry.relativePath);
}

describe('rankFiles', () => {
  it('devuelve los primeros con la consulta vacía', () => {
    // Abrir quick open sin tipear nada tiene que mostrar algo, no una lista
    // en blanco.
    expect(ranked('', [file('a.ts'), file('b.ts')])).toEqual(['a.ts', 'b.ts']);
  });

  it('prefiere el archivo cuyo nombre coincide sobre el que coincide por carpeta', () => {
    // Es la única regla propia de quick open. Sin ella, los dos puntúan
    // parecido y el que uno quería queda enterrado.
    const files = [file('packages/index-utils/cache.ts'), file('src/index.ts')];

    expect(ranked('index', files)[0]).toBe('src/index.ts');
  });

  it('igual muestra los que sólo coinciden por la carpeta', () => {
    const files = [file('src/api.ts'), file('otro/cosa.ts')];

    // Tipear `src/a` para llegar a `src/api.ts` tiene que funcionar.
    expect(ranked('src/a', files)).toEqual(['src/api.ts']);
  });

  it('descarta lo que no coincide', () => {
    expect(ranked('zzz', [file('a.ts'), file('b.ts')])).toEqual([]);
  });

  it('coincide sin exigir que las letras sean contiguas', () => {
    expect(ranked('mre', [file('model-registry.ts')])).toEqual(['model-registry.ts']);
  });

  it('ignora mayúsculas y acentos, como la paleta', () => {
    expect(ranked('ARCH', [file('src/Archivo.ts')])).toEqual(['src/Archivo.ts']);
  });

  it('corta en el límite pedido', () => {
    // El presupuesto de RF-205 son 50ms: no se le construye al renderer una
    // vista de veinte mil filas que nadie va a mirar.
    const files = Array.from({ length: 500 }, (_unused, index) => file(`a${String(index)}.ts`));

    expect(rankFiles('a', files, 10)).toHaveLength(10);
  });

  it('corta también con la consulta vacía', () => {
    const files = Array.from({ length: 500 }, (_unused, index) => file(`a${String(index)}.ts`));

    expect(rankFiles('', files, 10)).toHaveLength(10);
  });

  it('mantiene un orden estable entre archivos igual de buenos', () => {
    const files = [file('src/uno.ts'), file('src/dos.ts')];

    // Dos veces la misma consulta tiene que dar el mismo orden.
    expect(ranked('s', files)).toEqual(ranked('s', files));
  });

  it('funciona con un índice vacío', () => {
    expect(ranked('lo que sea', [])).toEqual([]);
  });
});
