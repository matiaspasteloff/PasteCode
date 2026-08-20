import { describe, expect, it } from 'vitest';

import { isSamePath } from './same-path.js';

const A = 'C:\\p\\a.ts';

describe('isSamePath', () => {
  it('ignora la caja de la letra de unidad', () => {
    // Es el caso que motivó la función: Monaco normaliza el `fsPath` de sus
    // modelos con la unidad en minúscula y el resto del proyecto la conserva
    // como vino del sistema. Con `===` daba falso entre el mismo archivo.
    expect(isSamePath('c:\\p\\a.ts', A)).toBe(true);
  });

  it('distingue dos archivos distintos', () => {
    expect(isSamePath(A, 'C:\\p\\b.ts')).toBe(false);
  });

  it('no confunde dos rutas con el mismo nombre en carpetas distintas', () => {
    expect(isSamePath('C:\\uno\\a.ts', 'C:\\dos\\a.ts')).toBe(false);
  });

  it('un undefined nunca es igual a nada, ni siquiera a otro undefined', () => {
    // Dos archivos ausentes no son el mismo archivo: devolver `true` haría que
    // una decoración se pintara sobre un editor sin modelo.
    expect(isSamePath(undefined, A)).toBe(false);
    expect(isSamePath(A, undefined)).toBe(false);
    expect(isSamePath(undefined, undefined)).toBe(false);
  });
});
