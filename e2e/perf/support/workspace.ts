import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Crea un workspace de mentira con N archivos TypeScript.
 *
 * Sale de `memory.perf.ts`, que era el único que lo necesitaba, porque desde la
 * Etapa 4 hay tres sondas que quieren lo mismo: un proyecto con archivos de
 * verdad sobre el que abrir pestañas.
 *
 * @param fileCount Cuántos archivos crear en `src/`.
 * @returns La raíz del workspace.
 * @example
 * const workspace = await createPerfWorkspace(1000);
 */
export async function createPerfWorkspace(fileCount: number): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), 'pastecode-perf-'));

  await mkdir(join(workspace, 'src'), { recursive: true });

  await Promise.all(
    Array.from({ length: fileCount }, async (_unused, index) =>
      writeFile(
        join(workspace, 'src', `archivo-${String(index)}.ts`),
        `export const valor${String(index)} = ${String(index)};\n`,
        'utf8'
      )
    )
  );

  return workspace;
}

/**
 * Escribe un `settings.json` de usuario en un directorio de datos de test.
 *
 * Es lo que hace posible medir **el mismo escenario con el LSP apagado y
 * encendido**: `PASTECODE_E2E_HOME` redirige el directorio de datos, y el
 * archivo que va adentro es el mismo que escribiría una persona.
 *
 * @param dataDirectory El directorio que va en `PASTECODE_E2E_HOME`.
 * @param settings Lo que se escribe. Parcial, como cualquier `settings.json`.
 * @example
 * await writeUserSettings(home, { lsp: { enabled: false } });
 */
export async function writeUserSettings(
  dataDirectory: string,
  settings: Record<string, unknown>
): Promise<void> {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(
    join(dataDirectory, 'settings.json'),
    `${JSON.stringify(settings, null, 2)}\n`,
    'utf8'
  );
}

/**
 * Prepara un workspace TypeScript real, con su `tsconfig` y su `typescript`.
 *
 * El `node_modules/typescript` se enlaza al del propio repositorio en vez de
 * instalarse: son ~22MB y la sonda ya tarda bastante. **Sin ese enlace el
 * servidor de TypeScript no arranca** —el `tsserver` sale del workspace, por
 * ADR-0017— así que quien llama tiene que poder saltear la medición si el
 * enlace falla, que es lo que devuelve el booleano.
 *
 * @param workspace Raíz del workspace, ya creada.
 * @param typescriptDirectory El `node_modules/typescript` a enlazar.
 * @returns `true` si el workspace quedó utilizable por el servidor.
 * @example
 * const isReady = await linkTypeScript(workspace, join(repoRoot, 'node_modules', 'typescript'));
 */
export async function linkTypeScript(
  workspace: string,
  typescriptDirectory: string
): Promise<boolean> {
  await writeFile(
    join(workspace, 'tsconfig.json'),
    `${JSON.stringify({ compilerOptions: { strict: true, noEmit: true }, include: ['src'] }, null, 2)}\n`,
    'utf8'
  );

  try {
    const { symlink } = await import('node:fs/promises');

    await mkdir(join(workspace, 'node_modules'), { recursive: true });
    // `junction` es lo que evita pedir privilegios de administrador en Windows
    // para enlazar un directorio; en POSIX el tipo se ignora.
    await symlink(
      typescriptDirectory,
      join(workspace, 'node_modules', 'typescript'),
      'junction'
    );

    return true;
  } catch {
    return false;
  }
}
