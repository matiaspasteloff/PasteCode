import { describe, expect, it } from 'vitest';

import { isAllowedNavigation, isSafeExternalUrl } from './navigation.js';

const DEV_ORIGIN = 'http://localhost:5173';
const APP_ORIGIN = 'pastecode://app';

describe('isAllowedNavigation', () => {
  it('permite el origen propio de la app en producción', () => {
    expect(isAllowedNavigation(`${APP_ORIGIN}/index.html`, APP_ORIGIN, undefined)).toBe(true);
  });

  it('bloquea file:// aunque sea el bundle en disco', () => {
    // Desde ADR-0012 el renderer se sirve por el esquema propio, así que una
    // navegación a file:// dejó de ser el caso normal: es la forma de que un
    // link abra un HTML del disco con el preload ya inyectado.
    expect(isAllowedNavigation('file:///c:/app/index.html', APP_ORIGIN, undefined)).toBe(false);
  });

  it('bloquea otro host del mismo esquema propio', () => {
    expect(isAllowedNavigation('pastecode://otro/index.html', APP_ORIGIN, undefined)).toBe(
      false
    );
  });

  it('bloquea un origen externo en producción', () => {
    expect(isAllowedNavigation('https://evil.test/login', APP_ORIGIN, undefined)).toBe(false);
  });

  it('bloquea el dev server en producción', () => {
    // Es el caso que justifica separar la política por modo: lo que en
    // desarrollo es el HMR, en producción es una navegación a un servidor local
    // arbitrario.
    expect(isAllowedNavigation(`${DEV_ORIGIN}/`, APP_ORIGIN, undefined)).toBe(false);
  });

  it('permite el dev server cuando está en desarrollo', () => {
    expect(isAllowedNavigation(`${DEV_ORIGIN}/index.html`, APP_ORIGIN, DEV_ORIGIN)).toBe(true);
  });

  it('bloquea otro puerto de localhost estando en desarrollo', () => {
    expect(isAllowedNavigation('http://localhost:9999/', APP_ORIGIN, DEV_ORIGIN)).toBe(false);
  });

  it('bloquea una URL que no parsea', () => {
    expect(isAllowedNavigation('no soy una url', APP_ORIGIN, undefined)).toBe(false);
  });
});

describe('isSafeExternalUrl', () => {
  it('acepta https', () => {
    expect(isSafeExternalUrl('https://github.com/matiaspasteloff/PasteCode')).toBe(true);
  });

  it('rechaza http', () => {
    expect(isSafeExternalUrl('http://ejemplo.test')).toBe(false);
  });

  it('rechaza file, que abriría un archivo local', () => {
    expect(isSafeExternalUrl('file:///c:/windows/system32/calc.exe')).toBe(false);
  });

  it('rechaza un protocolo custom, que lanzaría la app que lo tenga registrado', () => {
    expect(isSafeExternalUrl('ms-msdt:/id')).toBe(false);
  });

  it('rechaza javascript:', () => {
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
  });
});
