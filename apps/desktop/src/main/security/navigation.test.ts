import { describe, expect, it } from 'vitest';

import { isAllowedNavigation, isSafeExternalUrl } from './navigation.js';

const DEV_ORIGIN = 'http://localhost:5173';

describe('isAllowedNavigation', () => {
  it('permite file:// en producción', () => {
    expect(isAllowedNavigation('file:///c:/app/index.html', undefined)).toBe(true);
  });

  it('bloquea un origen externo en producción', () => {
    expect(isAllowedNavigation('https://evil.test/login', undefined)).toBe(false);
  });

  it('bloquea el dev server en producción', () => {
    // Es el caso que justifica separar la política por modo: lo que en
    // desarrollo es el HMR, en producción es una navegación a un servidor local
    // arbitrario.
    expect(isAllowedNavigation(`${DEV_ORIGIN}/`, undefined)).toBe(false);
  });

  it('permite el dev server cuando está en desarrollo', () => {
    expect(isAllowedNavigation(`${DEV_ORIGIN}/index.html`, DEV_ORIGIN)).toBe(true);
  });

  it('bloquea otro puerto de localhost estando en desarrollo', () => {
    expect(isAllowedNavigation('http://localhost:9999/', DEV_ORIGIN)).toBe(false);
  });

  it('bloquea una URL que no parsea', () => {
    expect(isAllowedNavigation('no soy una url', undefined)).toBe(false);
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
