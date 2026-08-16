import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, SettingsFileSchema, SettingsSchema } from './schema.js';

describe('SettingsFileSchema', () => {
  it('acepta un archivo vacío', () => {
    // Es el caso que el schema documentado no podía parsear, y es el archivo
    // que se escribe la primera vez.
    expect(SettingsFileSchema.parse({})).toEqual({});
  });

  it('acepta un archivo con una sola clave', () => {
    // Lo que una persona escribe de verdad cuando quiere agrandar la letra.
    expect(SettingsFileSchema.parse({ editor: { fontSize: 16 } })).toEqual({
      editor: { fontSize: 16 },
    });
  });

  it('rechaza una clave que no existe, en vez de ignorarla', () => {
    // `fontsize` en minúscula tiene que dar un error visible: si se ignorara,
    // el usuario ve que no pasó nada y no tiene forma de saber por qué.
    expect(() => SettingsFileSchema.parse({ editor: { fontsize: 16 } })).toThrow();
  });

  it('rechaza un grupo que no existe', () => {
    expect(() => SettingsFileSchema.parse({ editorr: {} })).toThrow();
  });

  it('rechaza un valor del tipo equivocado', () => {
    expect(() => SettingsFileSchema.parse({ editor: { fontSize: '16' } })).toThrow();
  });

  it('rechaza un valor fuera de rango', () => {
    expect(() => SettingsFileSchema.parse({ editor: { fontSize: 300 } })).toThrow();
  });

  it('acepta el campo de versión', () => {
    expect(SettingsFileSchema.parse({ version: 1 })).toEqual({ version: 1 });
  });

  it('rechaza una versión que no conoce', () => {
    // Un archivo de una versión futura se rechaza en vez de interpretarse mal.
    expect(() => SettingsFileSchema.parse({ version: 2 })).toThrow();
  });

  it('acepta null como shell, que es "el del sistema operativo"', () => {
    expect(SettingsFileSchema.parse({ terminal: { shell: null } })).toEqual({
      terminal: { shell: null },
    });
  });
});

describe('SettingsSchema', () => {
  it('valida los defaults, que son el piso de la precedencia', () => {
    // Si esto fallara, la aplicación no podría arrancar ni con cero archivos.
    expect(() => SettingsSchema.parse(DEFAULT_SETTINGS)).not.toThrow();
  });

  it('exige todos los grupos: es el valor resuelto, no un archivo', () => {
    expect(() => SettingsSchema.parse({})).toThrow();
  });

  it('exige todos los campos de un grupo', () => {
    expect(() =>
      SettingsSchema.parse({ ...DEFAULT_SETTINGS, editor: { fontSize: 14 } })
    ).toThrow();
  });
});
