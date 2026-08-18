import { mkdtemp, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { discardBackups, pendingBackups, useBackupDirectory, writeBackup } from './backups.js';

let sandbox: string;
let backups: string;
let file: string;

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'pastecode-backups-'));
  backups = join(sandbox, 'backups');
  file = join(sandbox, 'a.ts');

  useBackupDirectory(backups);
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

/** Le pone al archivo un `mtime` explícito, para controlar la comparación. */
async function touchAt(path: string, when: number): Promise<void> {
  await utimes(path, new Date(when), new Date(when));
}

describe('writeBackup', () => {
  it('crea el directorio de respaldos si no existe', async () => {
    await writeBackup(file, 'const x = 1;');

    await expect(stat(backups)).resolves.toBeDefined();
  });

  it('guarda un archivo por ruta respaldada', async () => {
    await writeBackup(file, 'uno');
    await writeBackup(join(sandbox, 'b.ts'), 'dos');

    expect(await readdir(backups)).toHaveLength(2);
  });

  it('no usa la ruta como nombre de archivo', async () => {
    // El nombre es el hash: una ruta larga de Windows se pasa del límite de
    // 260 caracteres, y además lleva adentro el nombre de usuario de alguien.
    await writeBackup(file, 'x');

    const [name] = await readdir(backups);

    expect(name).toMatch(/^[0-9a-f]{64}\.json$/);
  });

  it('pisa el respaldo anterior del mismo archivo', async () => {
    await writeBackup(file, 'viejo');
    await writeBackup(file, 'nuevo');

    expect(await readdir(backups)).toHaveLength(1);
    expect((await pendingBackups())[0]?.content).toBe('nuevo');
  });

  it('no deja temporales de la escritura atómica', async () => {
    await writeBackup(file, 'x');

    expect((await readdir(backups)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});

describe('pendingBackups', () => {
  it('no devuelve nada sin directorio de respaldos', async () => {
    // Es el arranque normal de una instalación nueva, y no es un error.
    await expect(pendingBackups()).resolves.toEqual([]);
  });

  it('devuelve el respaldo de un archivo que no existe en disco', async () => {
    // Lo que quedó respaldado es entonces la única copia que hay.
    await writeBackup(file, 'lo único que queda');

    const pending = await pendingBackups();

    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ path: file, content: 'lo único que queda' });
  });

  it('devuelve el respaldo cuando el archivo en disco es más viejo', async () => {
    await writeFile(file, 'viejo', 'utf8');
    await touchAt(file, Date.now() - 60_000);

    await writeBackup(file, 'lo que se estaba escribiendo');

    expect(await pendingBackups()).toHaveLength(1);
  });

  it('descarta el respaldo cuando ya se guardó después', async () => {
    // Si el archivo es más nuevo, el contenido bueno es el del disco.
    // Ofrecerlo igual sería proponer pisar lo guardado con una versión vieja.
    await writeBackup(file, 'lo que había sin guardar');
    await writeFile(file, 'lo que se guardó después', 'utf8');
    await touchAt(file, Date.now() + 60_000);

    expect(await pendingBackups()).toEqual([]);
  });

  it('limpia el respaldo que ya no sirve, en vez de dejarlo para siempre', async () => {
    await writeBackup(file, 'x');
    await writeFile(file, 'guardado', 'utf8');
    await touchAt(file, Date.now() + 60_000);

    await pendingBackups();

    expect(await readdir(backups)).toEqual([]);
  });

  it('ignora un respaldo con el JSON roto sin romper el resto', async () => {
    await writeBackup(file, 'bueno');
    await writeFile(join(backups, 'roto.json'), '{ no soy json', 'utf8');

    // Un respaldo corrupto no puede impedir recuperar los demás: es
    // exactamente el momento en que alguien más los necesita.
    const pending = await pendingBackups();

    expect(pending).toHaveLength(1);
    expect(pending[0]?.content).toBe('bueno');
  });

  it('ignora un respaldo cuyo contenido no cumple el schema', async () => {
    await writeBackup(file, 'bueno');
    await writeFile(join(backups, 'ajeno.json'), JSON.stringify({ hola: 1 }), 'utf8');

    expect(await pendingBackups()).toHaveLength(1);
  });
});

describe('discardBackups', () => {
  it('borra el respaldo de una ruta', async () => {
    await writeBackup(file, 'x');
    await writeBackup(join(sandbox, 'b.ts'), 'y');

    await discardBackups(file);

    const pending = await pendingBackups();

    expect(pending).toHaveLength(1);
    expect(pending[0]?.path).toBe(join(sandbox, 'b.ts'));
  });

  it('borra todos cuando no se le da ruta', async () => {
    // Es lo que hace "descartar" en el diálogo: sin esto, el mismo
    // ofrecimiento volvería en cada arranque para siempre.
    await writeBackup(file, 'x');
    await writeBackup(join(sandbox, 'b.ts'), 'y');

    await discardBackups();

    expect(await pendingBackups()).toEqual([]);
  });

  it('no falla al borrar algo que no existe', async () => {
    await expect(discardBackups(join(sandbox, 'fantasma.ts'))).resolves.toBeUndefined();
  });
});
