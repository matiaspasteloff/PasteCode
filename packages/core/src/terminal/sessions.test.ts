import { describe, expect, it } from 'vitest';

import { displayNameFor, nextSessionId } from './sessions.js';

describe('nextSessionId', () => {
  it('arranca en 1 cuando no hay ninguna sesión', () => {
    expect(nextSessionId([])).toBe('terminal-1');
  });

  it('sigue desde el id más alto', () => {
    expect(nextSessionId(['terminal-1', 'terminal-2'])).toBe('terminal-3');
  });

  it('no recicla el id de una sesión cerrada', () => {
    // Si reciclara, un `terminal:data` en vuelo del proceso viejo se pintaría
    // en la terminal nueva. Es una carrera de milisegundos.
    expect(nextSessionId(['terminal-4'])).toBe('terminal-5');
  });

  it('ignora un id con una forma que no reconoce', () => {
    expect(nextSessionId(['terminal-2', 'lo-que-sea'])).toBe('terminal-3');
  });
});

describe('displayNameFor', () => {
  it('usa el nombre del ejecutable, sin extensión', () => {
    expect(displayNameFor('C:\\WINDOWS\\system32\\powershell.exe', [])).toBe('powershell');
  });

  it('funciona igual con una ruta POSIX', () => {
    // El mismo caso tiene que dar lo mismo en el runner de Linux del CI.
    expect(displayNameFor('/bin/bash', [])).toBe('bash');
  });

  it('desambigua con un sufijo cuando el nombre ya está en uso', () => {
    expect(displayNameFor('/bin/bash', ['bash'])).toBe('bash (2)');
  });

  it('reusa el primer sufijo libre en vez de contar cuántas hay', () => {
    // Cerrar la segunda de tres y abrir otra tiene que devolver el (2).
    expect(displayNameFor('/bin/bash', ['bash', 'bash (3)'])).toBe('bash (2)');
  });

  it('sigue subiendo mientras los sufijos estén ocupados', () => {
    expect(displayNameFor('/bin/bash', ['bash', 'bash (2)', 'bash (3)'])).toBe('bash (4)');
  });

  it('conserva un nombre que empieza con punto', () => {
    // `.bashrc` no se llama vacío.
    expect(displayNameFor('/home/matias/.bashrc', [])).toBe('.bashrc');
  });

  it('no pierde el nombre de un ejecutable sin extensión', () => {
    expect(displayNameFor('/usr/bin/zsh', [])).toBe('zsh');
  });
});
