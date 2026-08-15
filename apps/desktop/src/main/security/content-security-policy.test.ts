import { describe, expect, it } from 'vitest';

import { buildContentSecurityPolicy } from './content-security-policy.js';

describe('buildContentSecurityPolicy', () => {
  const production = buildContentSecurityPolicy(undefined);

  it('no permite unsafe-eval en producción', () => {
    expect(production).not.toContain("'unsafe-eval'");
  });

  it('no permite scripts inline en producción', () => {
    expect(production).toContain("script-src 'self'");
    expect(production).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  it('mantiene la excepción de style-src documentada en ADR-0002', () => {
    expect(production).toContain("style-src 'self' 'unsafe-inline'");
  });

  it('restringe el resto a self en producción', () => {
    expect(production).toContain("default-src 'self'");
    expect(production).toContain("connect-src 'self'");
    expect(production).toContain("object-src 'none'");
    expect(production).toContain("base-uri 'none'");
  });

  it('habilita el WebSocket de HMR sólo en desarrollo', () => {
    const development = buildContentSecurityPolicy('http://localhost:5173');

    expect(development).toContain('ws://localhost:5173');
    expect(production).not.toContain('ws://');
  });

  it('permite unsafe-eval sólo en desarrollo', () => {
    expect(buildContentSecurityPolicy('http://localhost:5173')).toContain("'unsafe-eval'");
  });
});
