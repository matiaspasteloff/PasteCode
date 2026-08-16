import { beforeEach, describe, expect, it } from 'vitest';

import type { DocumentRegistry, OpenDocument } from './documents.js';
import { createDocumentRegistry } from './documents.js';

const DOCUMENT: OpenDocument = {
  path: 'C:\\p\\a.ts',
  serverId: 'typescript',
  languageId: 'typescript',
  version: 1,
};

describe('createDocumentRegistry', () => {
  let documents: DocumentRegistry;

  beforeEach(() => {
    documents = createDocumentRegistry();
  });

  it('avisa que la primera apertura es nueva', () => {
    expect(documents.open(DOCUMENT)).toBe(true);
  });

  it('avisa que la segunda apertura del mismo archivo no lo es', () => {
    documents.open(DOCUMENT);

    expect(documents.open({ ...DOCUMENT, version: 2 })).toBe(false);
  });

  it('acepta una versión que avanza y la registra', () => {
    documents.open(DOCUMENT);

    expect(documents.accept(DOCUMENT.path, 2)).toBe(true);
    expect(documents.get(DOCUMENT.path)?.version).toBe(2);
  });

  it('descarta una versión vieja sin tocar la registrada', () => {
    documents.open({ ...DOCUMENT, version: 5 });

    expect(documents.accept(DOCUMENT.path, 4)).toBe(false);
    expect(documents.get(DOCUMENT.path)?.version).toBe(5);
  });

  it('descarta la misma versión: es una descarga que ya se aplicó', () => {
    documents.open({ ...DOCUMENT, version: 5 });

    expect(documents.accept(DOCUMENT.path, 5)).toBe(false);
  });

  it('descarta cambios de un documento que no está abierto', () => {
    expect(documents.accept(DOCUMENT.path, 1)).toBe(false);
  });

  it('devuelve el documento al cerrarlo y lo olvida', () => {
    documents.open(DOCUMENT);

    expect(documents.close(DOCUMENT.path)).toEqual(DOCUMENT);
    expect(documents.get(DOCUMENT.path)).toBeUndefined();
  });

  it('devuelve undefined al cerrar uno que no estaba', () => {
    expect(documents.close(DOCUMENT.path)).toBeUndefined();
  });

  it('lista sólo los de un servidor', () => {
    documents.open(DOCUMENT);
    documents.open({ ...DOCUMENT, path: 'C:\\p\\b.rs', serverId: 'rust', languageId: 'rust' });

    expect(documents.forServer('typescript').map((item) => item.path)).toEqual([DOCUMENT.path]);
  });

  it('olvida sólo los del servidor que se reinició', () => {
    documents.open(DOCUMENT);
    documents.open({ ...DOCUMENT, path: 'C:\\p\\b.rs', serverId: 'rust', languageId: 'rust' });

    documents.forgetServer('typescript');

    expect(documents.get(DOCUMENT.path)).toBeUndefined();
    expect(documents.get('C:\\p\\b.rs')).toBeDefined();
  });

  it('olvida todo al cambiar de workspace', () => {
    documents.open(DOCUMENT);
    documents.clear();

    expect(documents.forServer('typescript')).toEqual([]);
  });
});
