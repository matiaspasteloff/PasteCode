import { describe, expect, it } from 'vitest';

import { COMPLETION_KINDS, completionKindFromLsp } from './completion-mapping.js';

describe('COMPLETION_KINDS', () => {
  it('tiene las veinticinco clases del protocolo', () => {
    expect(COMPLETION_KINDS).toHaveLength(25);
  });

  it('no repite ninguna', () => {
    expect(new Set(COMPLETION_KINDS).size).toBe(COMPLETION_KINDS.length);
  });
});

describe('completionKindFromLsp', () => {
  it('mapea los extremos del rango del protocolo', () => {
    expect(completionKindFromLsp(1)).toBe('text');
    expect(completionKindFromLsp(25)).toBe('typeParameter');
  });

  it('mapea las clases que más aparecen', () => {
    expect(completionKindFromLsp(3)).toBe('function');
    expect(completionKindFromLsp(6)).toBe('variable');
    expect(completionKindFromLsp(15)).toBe('snippet');
  });

  it('trata la ausencia como texto', () => {
    expect(completionKindFromLsp(undefined)).toBe('text');
  });

  it('trata un valor fuera de rango como texto', () => {
    expect(completionKindFromLsp(0)).toBe('text');
    expect(completionKindFromLsp(99)).toBe('text');
  });
});
