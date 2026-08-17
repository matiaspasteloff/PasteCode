import { describe, expect, it } from 'vitest';

import { parseDiffHunks } from './diff-hunks.js';

describe('parseDiffHunks', () => {
  it('devuelve una lista vacía para un diff vacío', () => {
    expect(parseDiffHunks('')).toEqual([]);
  });

  it('lee un agregado: sin líneas viejas', () => {
    expect(parseDiffHunks('@@ -3,0 +4,2 @@')).toEqual([
      { startLine: 4, lineCount: 2, kind: 'added' },
    ]);
  });

  it('lee una modificación: hay líneas viejas y nuevas', () => {
    expect(parseDiffHunks('@@ -10,3 +10,3 @@')).toEqual([
      { startLine: 10, lineCount: 3, kind: 'modified' },
    ]);
  });

  it('lee un borrado con cero líneas: la marca va en el borde', () => {
    expect(parseDiffHunks('@@ -5,2 +4,0 @@')).toEqual([
      { startLine: 4, lineCount: 0, kind: 'deleted' },
    ]);
  });

  it('no deja un borrado en la línea cero', () => {
    // Borrar desde la primera línea hace que git escriba `+0`.
    expect(parseDiffHunks('@@ -1,2 +0,0 @@')[0]?.startLine).toBe(1);
  });

  it('trata un conteo ausente como una línea', () => {
    expect(parseDiffHunks('@@ -7 +7 @@')).toEqual([
      { startLine: 7, lineCount: 1, kind: 'modified' },
    ]);
  });

  it('lee varios bloques en el orden en que git los escribió', () => {
    const diff = [
      'diff --git a/a.ts b/a.ts',
      'index abc..def 100644',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1,0 +2,1 @@',
      '+una',
      '@@ -8,1 +9,1 @@',
      '-vieja',
      '+nueva',
    ].join('\n');

    expect(parseDiffHunks(diff).map((hunk) => hunk.startLine)).toEqual([2, 9]);
  });

  it('ignora las líneas que no son cabeceras', () => {
    // El contenido de un archivo puede empezar con `@@` sin ser una cabecera.
    expect(parseDiffHunks('+@@ esto es contenido\n-@@ otro')).toEqual([]);
  });

  it('acepta el sufijo de contexto que git agrega después del segundo @@', () => {
    expect(parseDiffHunks('@@ -1,1 +1,1 @@ function x() {')).toHaveLength(1);
  });

  it('descarta una cabecera que no describe ningún cambio', () => {
    expect(parseDiffHunks('@@ -1,0 +1,0 @@')).toEqual([]);
  });
});
