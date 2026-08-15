import { describe, expect, it } from 'vitest';

import { isInsideRoot } from './is-inside-root.js';

describe('isInsideRoot', () => {
  describe('en rutas de Windows', () => {
    it('acepta un archivo que cuelga de la raíz', () => {
      expect(isInsideRoot('C:\\proyecto', 'C:\\proyecto\\src\\index.ts')).toBe(true);
    });

    it('acepta la raíz misma, porque el árbol necesita listarla', () => {
      expect(isInsideRoot('C:\\proyecto', 'C:\\proyecto')).toBe(true);
    });

    it('ignora las mayúsculas, porque el filesystem tampoco las distingue', () => {
      expect(isInsideRoot('C:\\proyecto', 'c:\\PROYECTO\\a.ts')).toBe(true);
    });

    it('acepta barras normales mezcladas con invertidas', () => {
      expect(isInsideRoot('C:\\proyecto', 'C:/proyecto/src/a.ts')).toBe(true);
    });

    it('ignora el separador final de la raíz', () => {
      expect(isInsideRoot('C:\\proyecto\\', 'C:\\proyecto\\a.ts')).toBe(true);
    });

    it('rechaza otra unidad', () => {
      expect(isInsideRoot('C:\\proyecto', 'D:\\proyecto\\a.ts')).toBe(false);
    });

    it('rechaza un prefijo engañoso', () => {
      expect(isInsideRoot('C:\\proyecto', 'C:\\proyecto2\\a.ts')).toBe(false);
    });

    it('rechaza un escape con .. hacia afuera de la raíz', () => {
      expect(isInsideRoot('C:\\proyecto', 'C:\\proyecto\\..\\..\\Windows\\notepad.exe')).toBe(
        false
      );
    });

    it('acepta un .. que vuelve a caer adentro', () => {
      expect(isInsideRoot('C:\\proyecto', 'C:\\proyecto\\src\\..\\test\\a.ts')).toBe(true);
    });

    it('descarta los .. que sobran en vez de escapar del volumen', () => {
      // Es lo que hacen tanto Windows como path.resolve: C:\..\..\x es C:\x.
      expect(isInsideRoot('C:\\', 'C:\\..\\..\\Windows')).toBe(true);
      expect(isInsideRoot('C:\\proyecto', 'C:\\..\\..\\Windows')).toBe(false);
    });

    it('ignora los segmentos . intermedios', () => {
      expect(isInsideRoot('C:\\proyecto', 'C:\\proyecto\\.\\src\\.\\a.ts')).toBe(true);
    });

    it('rechaza una ruta relativa a la unidad, que no es absoluta', () => {
      // 'C:src' se resuelve contra el CWD de esa unidad, no contra su raíz.
      expect(isInsideRoot('C:\\proyecto', 'C:src\\a.ts')).toBe(false);
    });
  });

  describe('en rutas UNC', () => {
    it('acepta un archivo del mismo recurso compartido', () => {
      expect(isInsideRoot('\\\\servidor\\recurso\\p', '\\\\servidor\\recurso\\p\\a.ts')).toBe(
        true
      );
    });

    it('ignora las mayúsculas del servidor y del recurso', () => {
      expect(isInsideRoot('\\\\Servidor\\Recurso', '\\\\servidor\\recurso\\a.ts')).toBe(true);
    });

    it('rechaza otro servidor', () => {
      expect(isInsideRoot('\\\\servidor\\recurso', '\\\\otro\\recurso\\a.ts')).toBe(false);
    });

    it('rechaza otro recurso del mismo servidor', () => {
      expect(isInsideRoot('\\\\servidor\\recurso', '\\\\servidor\\otro\\a.ts')).toBe(false);
    });

    it('rechaza una ruta con unidad contra una raíz UNC', () => {
      expect(isInsideRoot('\\\\servidor\\recurso', 'C:\\recurso\\a.ts')).toBe(false);
    });
  });

  describe('en rutas POSIX', () => {
    it('acepta un archivo que cuelga de la raíz', () => {
      expect(isInsideRoot('/home/matias/p', '/home/matias/p/src/a.ts')).toBe(true);
    });

    it('rechaza una ruta fuera de la raíz', () => {
      expect(isInsideRoot('/home/matias/p', '/etc/passwd')).toBe(false);
    });

    it('rechaza un prefijo engañoso', () => {
      expect(isInsideRoot('/home/matias/p', '/home/matias/p2/a.ts')).toBe(false);
    });

    it('distingue mayúsculas, que es la dirección conservadora', () => {
      // En un macOS con APFS insensible esto es un rechazo de más. Preferimos
      // eso a aceptar de más: el guard del main igual pasa por realpath.
      expect(isInsideRoot('/home/matias/p', '/home/matias/P/a.ts')).toBe(false);
    });

    it('rechaza un escape con .. hacia afuera de la raíz', () => {
      expect(isInsideRoot('/home/matias/p', '/home/matias/p/../../otro/a.ts')).toBe(false);
    });
  });

  describe('ante entradas que no son rutas absolutas', () => {
    it.each([
      ['la raíz vacía', '', 'C:\\proyecto\\a.ts'],
      ['el candidato vacío', 'C:\\proyecto', ''],
      ['un candidato relativo', 'C:\\proyecto', 'src\\a.ts'],
      ['una raíz relativa', 'proyecto', 'proyecto\\a.ts'],
      ['un candidato que parece UNC pero le falta el recurso', 'C:\\p', '\\\\servidor'],
    ])('rechaza %s', (_caso, root, candidate) => {
      expect(isInsideRoot(root, candidate)).toBe(false);
    });
  });
});
