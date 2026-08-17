import type { GitRepository, SerializedError } from '@pastecode/ipc-contract';
import { beforeEach, describe, expect, it } from 'vitest';

import { installFakeApi } from '../test-support/fake-api.js';

import { useGitStore } from './git-store.js';

/** Un repositorio cualquiera, con la rama puesta. */
function repository(name: string | null = 'main'): GitRepository {
  return {
    root: '/proyecto',
    branch: { name, upstream: null, ahead: 0, behind: 0 },
    changes: [],
  };
}

/** El error que devuelve un canal que falló. */
const FAILURE: SerializedError = {
  code: 'GIT_COMMAND_FAILED',
  userMessage: 'el hook de pre-commit rechazó el commit',
};

let invoke: ReturnType<typeof installFakeApi>;

/** Instala el api falso con todos los canales de git en éxito. */
function installAllOk(): void {
  invoke = installFakeApi({
    'git:getStatus': { ok: true, value: { repository: repository() } },
    'git:stage': { ok: true, value: {} },
    'git:unstage': { ok: true, value: {} },
    'git:commit': { ok: true, value: {} },
    'git:listBranches': { ok: true, value: { branches: ['main', 'feature/x'] } },
    'git:checkoutBranch': { ok: true, value: {} },
  });
}

beforeEach(() => {
  installAllOk();

  useGitStore.setState({
    repository: null,
    commitMessage: '',
    isBusy: false,
    error: null,
    branches: [],
    isBranchPickerOpen: false,
  });
});

describe('useGitStore', () => {
  it('aplica el repositorio que llega por git:changed', () => {
    useGitStore.getState().setRepository(repository('otra'));

    expect(useGitStore.getState().repository?.branch.name).toBe('otra');
  });

  it('refresca el estado desde git:getStatus', async () => {
    await useGitStore.getState().refresh();

    expect(useGitStore.getState().repository?.root).toBe('/proyecto');
  });

  it('deja el repositorio como estaba si el refresco falla', async () => {
    useGitStore.getState().setRepository(repository('la-que-habia'));
    invoke = installFakeApi({ 'git:getStatus': { ok: false, error: FAILURE } });

    await useGitStore.getState().refresh();

    // Vaciar la UI de Git porque un refresco falló sería perder información que
    // seguía siendo cierta.
    expect(useGitStore.getState().repository?.branch.name).toBe('la-que-habia');
  });

  it('prepara y desprepara las rutas que se le pasan', async () => {
    await useGitStore.getState().stage(['src/a.ts']);
    await useGitStore.getState().unstage(['src/b.ts']);

    expect(invoke).toHaveBeenCalledWith('git:stage', { paths: ['src/a.ts'] });
    expect(invoke).toHaveBeenCalledWith('git:unstage', { paths: ['src/b.ts'] });
  });

  it('no pide el estado de nuevo después de una operación', async () => {
    // El main ya agendó el refresco y llega por `git:changed`: pedirlo acá sería
    // correr `git status` dos veces por cada click.
    await useGitStore.getState().stage(['src/a.ts']);

    expect(invoke).not.toHaveBeenCalledWith('git:getStatus', expect.anything());
  });

  it('apaga el progreso y guarda el error cuando una operación falla', async () => {
    invoke = installFakeApi({ 'git:stage': { ok: false, error: FAILURE } });

    await useGitStore.getState().stage(['src/a.ts']);

    expect(useGitStore.getState().isBusy).toBe(false);
    expect(useGitStore.getState().error).toEqual(FAILURE);
  });

  it('limpia el error de la operación anterior al arrancar la siguiente', async () => {
    useGitStore.setState({ error: FAILURE });

    await useGitStore.getState().stage(['src/a.ts']);

    expect(useGitStore.getState().error).toBeNull();
  });
});

describe('el commit', () => {
  it('commitea con el mensaje escrito y lo limpia', async () => {
    useGitStore.getState().setCommitMessage('feat: algo');

    await useGitStore.getState().commit();

    expect(invoke).toHaveBeenCalledWith('git:commit', { message: 'feat: algo' });
    expect(useGitStore.getState().commitMessage).toBe('');
  });

  it('recorta el mensaje antes de mandarlo', async () => {
    useGitStore.getState().setCommitMessage('  feat: algo  ');

    await useGitStore.getState().commit();

    expect(invoke).toHaveBeenCalledWith('git:commit', { message: 'feat: algo' });
  });

  it('no commitea con un mensaje que es sólo espacios', async () => {
    useGitStore.getState().setCommitMessage('   ');

    await useGitStore.getState().commit();

    expect(invoke).not.toHaveBeenCalledWith('git:commit', expect.anything());
  });

  it('conserva el mensaje cuando el commit falla', async () => {
    // Es lo que evita hacerle reescribir el mensaje a alguien cuyo hook de
    // pre-commit lo rechazó.
    invoke = installFakeApi({ 'git:commit': { ok: false, error: FAILURE } });
    useGitStore.getState().setCommitMessage('feat: algo');

    await useGitStore.getState().commit();

    expect(useGitStore.getState().commitMessage).toBe('feat: algo');
    expect(useGitStore.getState().error).toEqual(FAILURE);
  });
});

describe('el selector de ramas', () => {
  it('carga las ramas y se abre', async () => {
    await useGitStore.getState().openBranchPicker();

    expect(useGitStore.getState().branches).toEqual(['main', 'feature/x']);
    expect(useGitStore.getState().isBranchPickerOpen).toBe(true);
  });

  it('no se abre si no se pudieron listar las ramas', async () => {
    invoke = installFakeApi({ 'git:listBranches': { ok: false, error: FAILURE } });

    await useGitStore.getState().openBranchPicker();

    expect(useGitStore.getState().isBranchPickerOpen).toBe(false);
    expect(useGitStore.getState().error).toEqual(FAILURE);
  });

  it('se cierra sin tocar nada más', () => {
    useGitStore.setState({ isBranchPickerOpen: true, branches: ['main'] });

    useGitStore.getState().closeBranchPicker();

    expect(useGitStore.getState().isBranchPickerOpen).toBe(false);
    expect(useGitStore.getState().branches).toEqual(['main']);
  });

  it('se cierra al elegir una rama, sin esperar al checkout', async () => {
    useGitStore.setState({ isBranchPickerOpen: true });

    await useGitStore.getState().checkout('feature/x');

    expect(useGitStore.getState().isBranchPickerOpen).toBe(false);
    expect(invoke).toHaveBeenCalledWith('git:checkoutBranch', { branch: 'feature/x' });
  });
});
