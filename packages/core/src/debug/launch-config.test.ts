import { describe, expect, it } from 'vitest';

import { readLaunchFile } from './launch-config.js';

/** Las configuraciones de un archivo que tenía que ser válido. */
function configurationsOf(raw: string): { type: string; name: string }[] {
  const result = readLaunchFile(raw);

  if ('error' in result) throw new Error(`No leyó: ${result.error.userMessage}`);

  return result.configurations;
}

/** El error de un archivo que tenía que fallar. */
function errorOf(raw: string): { code: string; userMessage: string } {
  const result = readLaunchFile(raw);

  if (!('error' in result)) throw new Error('Tenía que fallar y leyó');

  return result.error;
}

describe('readLaunchFile', () => {
  it('lee una configuración mínima', () => {
    const configurations = configurationsOf(
      '{ "version": "0.2.0", "configurations": [{ "type": "node", "request": "launch", "name": "App" }] }'
    );

    expect(configurations).toEqual([{ type: 'node', request: 'launch', name: 'App' }]);
  });

  it('conserva las claves que sólo el adaptador entiende', () => {
    // `program`, `args`, `port`, `skipFiles`: cada adaptador tiene los suyos.
    // Un schema estricto obligaría a transcribir su documentación entera.
    const [config] = configurationsOf(
      '{ "configurations": [{ "type": "node", "request": "launch", "name": "App", "program": "${workspaceFolder}/app.js", "args": ["--port", "3000"] }] }'
    );

    expect(config).toMatchObject({
      program: '${workspaceFolder}/app.js',
      args: ['--port', '3000'],
    });
  });

  it('acepta un archivo sin version', () => {
    expect(
      configurationsOf(
        '{ "configurations": [{ "type": "node", "request": "attach", "name": "X" }] }'
      )
    ).toHaveLength(1);
  });

  it('acepta cero configuraciones', () => {
    expect(configurationsOf('{ "configurations": [] }')).toEqual([]);
  });

  describe('comentarios', () => {
    it('acepta comentarios de línea', () => {
      // El `launch.json` del ecosistema es JSONC y la gente lo comenta.
      const raw = `{
        // la de todos los días
        "configurations": [{ "type": "node", "request": "launch", "name": "App" }]
      }`;

      expect(configurationsOf(raw)).toHaveLength(1);
    });

    it('acepta comentarios de bloque', () => {
      const raw = `{
        /* esto queda para más adelante */
        "configurations": [{ "type": "node", "request": "launch", "name": "App" }]
      }`;

      expect(configurationsOf(raw)).toHaveLength(1);
    });

    it('no toca un // que está adentro de un string', () => {
      // Un `//` en una URL es lo más común del mundo, y un reemplazo ingenuo lo
      // rompe con un error que apunta a otro lado.
      const [config] = configurationsOf(
        '{ "configurations": [{ "type": "node", "request": "attach", "name": "X", "url": "http://localhost:3000" }] }'
      );

      expect(config).toMatchObject({ url: 'http://localhost:3000' });
    });

    it('no toca una ruta de Windows con barras invertidas', () => {
      const [config] = configurationsOf(
        '{ "configurations": [{ "type": "node", "request": "launch", "name": "X", "program": "C:\\\\proyecto\\\\app.js" }] }'
      );

      expect(config).toMatchObject({ program: 'C:\\proyecto\\app.js' });
    });

    it('no confunde una comilla escapada con el fin del string', () => {
      const [config] = configurationsOf(
        '{ "configurations": [{ "type": "node", "request": "launch", "name": "dice \\" y sigue" }] }'
      );

      expect(config?.name).toBe('dice " y sigue');
    });
  });

  describe('archivos que no sirven', () => {
    it('reporta un JSON roto sin lanzar', () => {
      expect(errorOf('{ esto no es json').code).toBe('LAUNCH_JSON_INVALID');
    });

    it('reporta una configuración sin name', () => {
      const error = errorOf('{ "configurations": [{ "type": "node", "request": "launch" }] }');

      expect(error.code).toBe('LAUNCH_JSON_SCHEMA');
      // El mensaje señala dónde: sin eso, arreglarlo es adivinar.
      expect(error.userMessage).toContain('configurations.0.name');
    });

    it('reporta un request que no es launch ni attach', () => {
      expect(
        errorOf('{ "configurations": [{ "type": "node", "request": "correr", "name": "X" }] }')
          .code
      ).toBe('LAUNCH_JSON_SCHEMA');
    });

    it('reporta un archivo sin configurations', () => {
      expect(errorOf('{ "version": "0.2.0" }').code).toBe('LAUNCH_JSON_SCHEMA');
    });
  });
});
