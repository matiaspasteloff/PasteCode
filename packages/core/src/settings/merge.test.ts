import { describe, expect, it } from 'vitest';

import { resolveSettings } from './merge.js';
import { DEFAULT_SETTINGS } from './schema.js';

describe('resolveSettings', () => {
  it('devuelve los defaults cuando no hay ningún archivo', () => {
    expect(resolveSettings({}, {})).toEqual(DEFAULT_SETTINGS);
  });

  it('el usuario le gana a los defaults', () => {
    const resolved = resolveSettings({ editor: { fontSize: 18 } }, {});

    expect(resolved.editor.fontSize).toBe(18);
  });

  it('el workspace le gana al usuario', () => {
    const resolved = resolveSettings(
      { editor: { fontSize: 18 } },
      { editor: { fontSize: 20 } }
    );

    expect(resolved.editor.fontSize).toBe(20);
  });

  it('combina claves distintas del mismo grupo en vez de reemplazar el grupo', () => {
    // Si reemplazara el grupo entero, poner `tabSize` en el workspace borraría
    // el `fontSize` del usuario, que es lo que nadie espera.
    const resolved = resolveSettings({ editor: { fontSize: 18 } }, { editor: { tabSize: 4 } });

    expect(resolved.editor).toMatchObject({ fontSize: 18, tabSize: 4 });
  });

  it('no toca los grupos que ningún archivo menciona', () => {
    const resolved = resolveSettings({ editor: { fontSize: 18 } }, {});

    expect(resolved.window).toEqual(DEFAULT_SETTINGS.window);
  });

  it('reemplaza los arrays enteros en vez de concatenarlos', () => {
    // Es la decisión que hace posible que un workspace **quite** una
    // exclusión: concatenando, sacar algo sería imposible.
    const resolved = resolveSettings(
      { files: { exclude: ['**/node_modules', '**/vendor'] } },
      { files: { exclude: ['**/build'] } }
    );

    expect(resolved.files.exclude).toEqual(['**/build']);
  });

  it('deja que el usuario elija el shell de la terminal', () => {
    const resolved = resolveSettings({ terminal: { shell: 'C:\\bin\\pwsh.exe' } }, {});

    expect(resolved.terminal.shell).toBe('C:\\bin\\pwsh.exe');
  });

  it('ignora el shell que pida el workspace', () => {
    // Un .pastecode/settings.json viaja adentro de cualquier repo clonado.
    // Clonar no puede ser lo mismo que aceptar ejecutar lo que el repo diga.
    const resolved = resolveSettings({}, { terminal: { shell: 'C:\\malo\\payload.exe' } });

    expect(resolved.terminal.shell).toBeNull();
  });

  it('el workspace tampoco puede pisar el shell que eligió el usuario', () => {
    const resolved = resolveSettings(
      { terminal: { shell: 'C:\\bin\\pwsh.exe' } },
      { terminal: { shell: 'C:\\malo\\payload.exe' } }
    );

    expect(resolved.terminal.shell).toBe('C:\\bin\\pwsh.exe');
  });

  it('el workspace sí puede cambiar el resto de la terminal', () => {
    // La excepción es sólo el ejecutable. El tamaño de fuente no ejecuta nada.
    const resolved = resolveSettings({}, { terminal: { fontSize: 16 } });

    expect(resolved.terminal.fontSize).toBe(16);
  });

  it('ignora los servidores de lenguaje que pida el workspace', () => {
    // Elegir el ejecutable de un servidor de lenguaje es elegir qué se ejecuta
    // al abrir un `.py`, sin que nadie haya hecho click en nada.
    const resolved = resolveSettings(
      {},
      { lsp: { serverPaths: { python: 'C:\\malo\\payload.exe' } } }
    );

    expect(resolved.lsp.serverPaths).toEqual({});
  });

  it('el workspace no puede agregar una entrada al mapa de servidores', () => {
    // Se pisa el mapa **entero** y no clave por clave: dejar que agregue una
    // sola entrada es dejar que elija el ejecutable de ese lenguaje.
    const resolved = resolveSettings(
      { lsp: { serverPaths: { typescript: 'C:\\bin\\tsls.js' } } },
      { lsp: { serverPaths: { rust: 'C:\\malo\\payload.exe' } } }
    );

    expect(resolved.lsp.serverPaths).toEqual({ typescript: 'C:\\bin\\tsls.js' });
  });

  it('ignora el adaptador de debug que pida el workspace', () => {
    // Elegir el adaptador es elegir qué se ejecuta al apretar F5. Un
    // `.pastecode/settings.json` viaja adentro de cualquier repositorio que se
    // clone, y clonar no puede ser lo mismo que aceptar ejecutar eso.
    const resolved = resolveSettings({}, { debug: { adapterPath: 'C:\\malo\\payload.exe' } });

    expect(resolved.debug.adapterPath).toBeNull();
  });

  it('el workspace tampoco puede pasarle argumentos al adaptador', () => {
    // Sin esto, el repositorio no elige el ejecutable pero sí con qué flags
    // corre: `--eval` sobre un adaptador legítimo alcanza para ejecutar código.
    const resolved = resolveSettings(
      { debug: { adapterPath: 'C:\\bin\\dap.js' } },
      { debug: { adapterArgs: ['--eval', 'algo feo'] } }
    );

    expect(resolved.debug).toMatchObject({ adapterPath: 'C:\\bin\\dap.js', adapterArgs: [] });
  });

  it('el workspace sí puede ajustar el timeout del adaptador', () => {
    // Lo que no elige un ejecutable no está restringido: un repositorio con un
    // adaptador lento tiene un motivo legítimo para pedir más tiempo.
    const resolved = resolveSettings({}, { debug: { requestTimeoutMs: 30_000 } });

    expect(resolved.debug.requestTimeoutMs).toBe(30_000);
  });

  it('ignora el git que pida el workspace', () => {
    const resolved = resolveSettings({}, { git: { path: 'C:\\malo\\git.exe' } });

    expect(resolved.git.path).toBeNull();
  });

  it('el workspace sí puede apagar git y las decoraciones', () => {
    // La excepción es sólo el ejecutable: apagar una feature no ejecuta nada, y
    // un repositorio puede tener razones legítimas para pedirlo.
    const resolved = resolveSettings(
      {},
      { git: { enabled: false, decorationsEnabled: false } }
    );

    expect(resolved.git.enabled).toBe(false);
    expect(resolved.git.decorationsEnabled).toBe(false);
  });

  it('no muta los defaults', () => {
    resolveSettings({ files: { exclude: [] } }, {});

    expect(DEFAULT_SETTINGS.files.exclude).toEqual(['**/node_modules', '**/.git', '**/dist']);
  });
});
