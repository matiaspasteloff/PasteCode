import { DEFAULT_SETTINGS, GitCommandError } from '@pastecode/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Lo que cada test configura antes de importar el servicio. */
interface FakeState {
  gitEnabled: boolean;
  gitPath: string | null;
  workspaceRoot: string | null;
  resolution: { path: string } | { problem: string };
  /** Argumentos con los que se llamó a `runGit`, en orden. */
  calls: string[][];
  /** Primer argumento de git → qué contesta, o qué error tira. */
  replies: Map<string, string | Error>;
}

/**
 * El estado que los mocks leen en cada test.
 *
 * Va en un `vi.hoisted` porque las fábricas de `vi.mock` se izan por encima de
 * los `import`: cualquier cosa que toquen tiene que existir antes que ellas.
 */
const fake = vi.hoisted((): FakeState => ({
  gitEnabled: true,
  gitPath: null,
  workspaceRoot: '/proyecto',
  resolution: { path: '/usr/bin/git' },
  calls: [],
  replies: new Map<string, string | Error>(),
}));

vi.mock('../services/settings.js', () => ({
  currentSettings: () => ({
    ...DEFAULT_SETTINGS,
    git: { enabled: fake.gitEnabled, path: fake.gitPath },
  }),
}));

vi.mock('../services/workspace.js', () => ({
  getWorkspace: () => (fake.workspaceRoot === null ? null : { root: fake.workspaceRoot }),
}));

vi.mock('./resolve-git.js', () => ({
  gitSearchDirectories: () => [],
  resolveGitExecutable: () => fake.resolution,
}));

vi.mock('./run.js', () => ({
  runGit: (invocation: { args: readonly string[] }) => {
    fake.calls.push([...invocation.args]);

    const reply = fake.replies.get(invocation.args[0] ?? '');

    if (reply instanceof Error) return Promise.reject(reply);

    return Promise.resolve(reply ?? '');
  },
}));

/** El módulo, recién importado. */
type Service = typeof import('./service.js');

/**
 * Importa `service.js` de cero.
 *
 * El módulo cachea el ejecutable y la raíz del repositorio en variables de
 * módulo —a propósito, por ADR-0019: resolver git una sola vez es el punto—,
 * así que compartir la instancia entre tests haría que el segundo midiera la
 * caché del primero.
 */
async function freshService(): Promise<Service> {
  vi.resetModules();

  return import('./service.js');
}

/** Una salida de `status --porcelain=v2 -z` con una rama y un archivo tocado. */
const STATUS_OUTPUT = [
  '# branch.head main',
  '# branch.upstream origin/main',
  '# branch.ab +1 -2',
  '1 .M N... 100644 100644 100644 abc def src/a.ts',
].join('\0');

beforeEach(() => {
  fake.gitEnabled = true;
  fake.gitPath = null;
  fake.workspaceRoot = '/proyecto';
  fake.resolution = { path: '/usr/bin/git' };
  fake.calls = [];
  fake.replies = new Map<string, string | Error>([
    ['rev-parse', '/proyecto\n'],
    ['status', STATUS_OUTPUT],
  ]);
});

describe('gitRepositoryStatus', () => {
  it('devuelve la rama y los cambios cuando el workspace es un repositorio', async () => {
    const { gitRepositoryStatus } = await freshService();

    const repository = await gitRepositoryStatus();

    expect(repository).toMatchObject({
      root: '/proyecto',
      branch: { name: 'main', upstream: 'origin/main', ahead: 1, behind: 2 },
    });
    expect(repository?.changes).toHaveLength(1);
  });

  it('devuelve null cuando la settings apaga git', async () => {
    fake.gitEnabled = false;

    const { gitRepositoryStatus } = await freshService();

    expect(await gitRepositoryStatus()).toBeNull();
    // Lo que importa no es el `null`, es que no se lanzó ningún proceso.
    expect(fake.calls).toHaveLength(0);
  });

  it('devuelve null cuando no hay ejecutable', async () => {
    fake.resolution = { problem: 'No se encontró git.' };

    const { gitRepositoryStatus } = await freshService();

    expect(await gitRepositoryStatus()).toBeNull();
  });

  it('devuelve null cuando no hay workspace abierto', async () => {
    fake.workspaceRoot = null;

    const { gitRepositoryStatus } = await freshService();

    expect(await gitRepositoryStatus()).toBeNull();
  });

  it('devuelve null cuando la carpeta no está en un repositorio', async () => {
    fake.replies.set('rev-parse', new GitCommandError('rev-parse', 'not a git repository'));

    const { gitRepositoryStatus } = await freshService();

    expect(await gitRepositoryStatus()).toBeNull();
  });

  it('detecta la raíz una sola vez aunque se pregunte varias', async () => {
    const { gitRepositoryStatus } = await freshService();

    await gitRepositoryStatus();
    await gitRepositoryStatus();

    expect(fake.calls.filter((args) => args[0] === 'rev-parse')).toHaveLength(1);
  });

  it('vuelve a detectar después de resetGitRepository', async () => {
    const { gitRepositoryStatus, resetGitRepository } = await freshService();

    await gitRepositoryStatus();
    resetGitRepository();
    await gitRepositoryStatus();

    expect(fake.calls.filter((args) => args[0] === 'rev-parse')).toHaveLength(2);
  });

  it('sobrevive a un status que falla, con el repositorio ya detectado', async () => {
    // Es el caso del `index.lock` de otro proceso: se informa lo que se sabe en
    // vez de tirar la UI de Git abajo.
    fake.replies.set('status', new GitCommandError('status', 'index.lock existe'));

    const { gitRepositoryStatus } = await freshService();

    expect(await gitRepositoryStatus()).toMatchObject({
      root: '/proyecto',
      branch: { name: null, ahead: 0, behind: 0 },
      changes: [],
    });
  });
});

describe('las operaciones que la persona pide explícitamente', () => {
  it('prepara los archivos que se le pasan', async () => {
    const { stageFiles } = await freshService();

    await stageFiles(['src/a.ts']);

    expect(fake.calls).toContainEqual(['add', '--', 'src/a.ts']);
  });

  it('desprepara sin tocar el árbol de trabajo', async () => {
    const { unstageFiles } = await freshService();

    await unstageFiles(['src/a.ts']);

    expect(fake.calls.at(-1)).toContain('src/a.ts');
  });

  it('commitea con el mensaje tal como se escribió', async () => {
    const { commitStaged } = await freshService();

    await commitStaged('feat: algo && rm -rf');

    expect(fake.calls.at(-1)).toContain('feat: algo && rm -rf');
  });

  it('lista las ramas locales', async () => {
    fake.replies.set('branch', 'main\nfeature/x\n');

    const { listBranches } = await freshService();

    expect(await listBranches()).toEqual(['main', 'feature/x']);
  });

  it('cambia de rama', async () => {
    const { checkoutBranch } = await freshService();

    await checkoutBranch('otra');

    expect(fake.calls.at(-1)).toContain('otra');
  });

  const explicitOperations: readonly (readonly [
    string,
    (service: Service) => Promise<unknown>,
  ])[] = [
    ['stageFiles', (service) => service.stageFiles(['a.ts'])],
    ['unstageFiles', (service) => service.unstageFiles(['a.ts'])],
    ['commitStaged', (service) => service.commitStaged('mensaje')],
    ['listBranches', (service) => service.listBranches()],
    ['checkoutBranch', (service) => service.checkoutBranch('main')],
  ];

  it.each(explicitOperations)(
    '%s avisa en vez de callarse cuando no hay git',
    async (_name, run) => {
      // El silencio es peor que el error acá: el botón que se apretó no hizo
      // nada y nadie dijo por qué.
      fake.resolution = { problem: 'No se encontró git.' };

      const service = await freshService();

      // Se compara el `code` y no la clase: `vi.resetModules()` hace que el
      // servicio reimporte `@pastecode/core`, así que el `GitUnavailableError`
      // que tira no es —por identidad— el mismo constructor que importó el test,
      // aunque sea el mismo error. El código es el contrato de todas formas.
      await expect(run(service)).rejects.toMatchObject({ code: 'GIT_UNAVAILABLE' });
    }
  );
});

describe('fileDiffHunks', () => {
  const DIFF = ['diff --git a/src/a.ts b/src/a.ts', '@@ -1,0 +2,3 @@', '+const a = 1;'].join(
    '\n'
  );

  beforeEach(() => {
    fake.replies.set('diff', DIFF);
  });

  it('devuelve los bloques cambiados del archivo', async () => {
    const { fileDiffHunks } = await freshService();

    const hunks = await fileDiffHunks('/proyecto/src/a.ts');

    expect(hunks).toHaveLength(1);
    expect(fake.calls.at(-1)).toContain('src/a.ts');
  });

  it('devuelve una lista vacía y no un error cuando no hay git', async () => {
    // El gutter es decoración: que no se pueda abrir una pestaña porque git no
    // está instalado sería absurdo.
    fake.resolution = { problem: 'No se encontró git.' };

    const { fileDiffHunks } = await freshService();

    expect(await fileDiffHunks('/proyecto/src/a.ts')).toEqual([]);
  });

  it('devuelve una lista vacía cuando la carpeta no es un repositorio', async () => {
    fake.replies.set('rev-parse', new GitCommandError('rev-parse', 'not a git repository'));

    const { fileDiffHunks } = await freshService();

    expect(await fileDiffHunks('/proyecto/src/a.ts')).toEqual([]);
  });

  it('devuelve una lista vacía cuando el archivo cae afuera del workspace', async () => {
    const { fileDiffHunks } = await freshService();

    expect(await fileDiffHunks('/otro/lado/a.ts')).toEqual([]);
    expect(fake.calls.some((args) => args[0] === 'diff')).toBe(false);
  });

  it('devuelve una lista vacía cuando git falla', async () => {
    fake.replies.set('diff', new GitCommandError('diff', 'lo que sea'));

    const { fileDiffHunks } = await freshService();

    expect(await fileDiffHunks('/proyecto/src/a.ts')).toEqual([]);
  });
});
