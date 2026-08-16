import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assertExecutable } from './executable.js';

describe('assertExecutable', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'pastecode-exec-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('acepta un archivo que existe y se puede leer', async () => {
    const file = join(directory, 'herramienta');
    await writeFile(file, '#!/bin/sh\n', { mode: 0o755 });

    expect(assertExecutable(file)).toBeNull();
  });

  it('rechaza un nombre suelto en vez de buscarlo en el PATH', () => {
    // Es la regla entera: dejar que el sistema elija el primero que encuentre
    // convierte una settings en "ejecutá lo que haya", y el PATH de un proyecto
    // lo puede escribir un repositorio clonado.
    expect(assertExecutable('git')).toBe('not-absolute');
    expect(assertExecutable('./git')).toBe('not-absolute');
  });

  it('rechaza una ruta absoluta que no existe', () => {
    expect(assertExecutable(join(directory, 'no-esta'))).toBe('not-executable');
  });

  it('devuelve un motivo en vez de lanzar', () => {
    // Cada consumidor tiene su propia clase de error y su propio userMessage:
    // el shell lanza, el LSP marca el servidor como fallado y sigue andando, y
    // Git simplemente desaparece de la UI.
    expect(() => assertExecutable('cualquiera')).not.toThrow();
  });
});
