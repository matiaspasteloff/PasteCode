import type { GitFileChange } from '@pastecode/core';
import type { GitRepository } from '@pastecode/ipc-contract';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useGitStore } from '../../stores/git-store.js';
import { resetEditorStore } from '../../test-support/editor-state.js';
import { installFakeApi } from '../../test-support/fake-api.js';

import { SourceControlPanel } from './SourceControlPanel.js';

/** Los dos estados que el panel separa en grupos. */
interface ChangeStates {
  index: GitFileChange['indexStatus'];
  worktree: GitFileChange['worktreeStatus'];
}

/** Un cambio, con el estado que el caso necesite en cada lado. */
function change(path: string, states: Partial<ChangeStates> = {}): GitFileChange {
  return {
    path,
    indexStatus: states.index ?? null,
    worktreeStatus: states.worktree ?? null,
    originalPath: null,
  };
}

/** Un repositorio con los cambios que el caso necesite. */
function repository(changes: readonly GitFileChange[] = []): GitRepository {
  return {
    root: 'C:\\proyecto',
    branch: { name: 'main', upstream: null, ahead: 0, behind: 0 },
    changes: [...changes],
  };
}

let invoke: ReturnType<typeof installFakeApi>;

beforeEach(() => {
  invoke = installFakeApi({
    'git:stage': { ok: true, value: {} },
    'git:unstage': { ok: true, value: {} },
    'git:commit': { ok: true, value: {} },
    'fs:readFile': { ok: true, value: { content: '', mtimeMs: 0 } },
  });

  // El store del editor es de módulo (ADR-0004): una pestaña que dejó abierta
  // otro test haría que `open` no relea el archivo.
  resetEditorStore();

  useGitStore.setState({
    repository: repository(),
    commitMessage: '',
    isBusy: false,
    error: null,
    branches: [],
    isBranchPickerOpen: false,
  });
});

describe('SourceControlPanel', () => {
  it('avisa cuando la carpeta no es un repositorio', () => {
    useGitStore.setState({ repository: null });

    render(<SourceControlPanel />);

    expect(screen.getByText('Esta carpeta no es un repositorio de Git')).toBeDefined();
  });

  it('avisa cuando el repositorio está limpio', () => {
    render(<SourceControlPanel />);

    expect(screen.getByText('No hay cambios')).toBeDefined();
  });

  it('separa lo preparado de lo que no, con su contador', () => {
    useGitStore.setState({
      repository: repository([
        change('src/a.ts', { index: 'modified' }),
        change('src/b.ts', { worktree: 'modified' }),
        change('src/c.ts', { worktree: 'untracked' }),
      ]),
    });

    render(<SourceControlPanel />);

    expect(screen.getByText('Preparado para commitear')).toBeDefined();
    expect(screen.getByText('Cambios')).toBeDefined();
    expect(screen.getByTestId('git-file-src/a.ts')).toBeDefined();
    expect(screen.getByTestId('git-file-src/c.ts')).toBeDefined();
  });

  it('muestra un archivo en los dos grupos cuando está preparado y vuelto a tocar', () => {
    // Es lo que el código `MM` de git significa, y esconder una de las dos
    // mitades haría que preparar el archivo no cambie nada visible.
    useGitStore.setState({
      repository: repository([change('src/a.ts', { index: 'modified', worktree: 'modified' })]),
    });

    render(<SourceControlPanel />);

    expect(screen.getByTestId('git-stage-src/a.ts')).toBeDefined();
    expect(screen.getByTestId('git-unstage-src/a.ts')).toBeDefined();
  });

  it('prepara el archivo de la fila', async () => {
    useGitStore.setState({
      repository: repository([change('src/a.ts', { worktree: 'modified' })]),
    });

    render(<SourceControlPanel />);
    await userEvent.click(screen.getByTestId('git-stage-src/a.ts'));

    expect(invoke).toHaveBeenCalledWith('git:stage', { paths: ['src/a.ts'] });
  });

  it('desprepara el archivo de la fila', async () => {
    useGitStore.setState({
      repository: repository([change('src/a.ts', { index: 'modified' })]),
    });

    render(<SourceControlPanel />);
    await userEvent.click(screen.getByTestId('git-unstage-src/a.ts'));

    expect(invoke).toHaveBeenCalledWith('git:unstage', { paths: ['src/a.ts'] });
  });

  it('abre el archivo al clickear su nombre', async () => {
    useGitStore.setState({
      repository: repository([change('src/a.ts', { worktree: 'modified' })]),
    });

    render(<SourceControlPanel />);
    await userEvent.click(screen.getByTestId('git-file-src/a.ts'));

    // La ruta se normaliza a `/` contra la raíz del repositorio, que en Windows
    // viene con `\`.
    expect(invoke).toHaveBeenCalledWith('fs:readFile', { path: 'C:/proyecto/src/a.ts' });
  });

  it('muestra el error de la última operación', () => {
    useGitStore.setState({
      error: { code: 'GIT_COMMAND_FAILED', userMessage: 'el hook lo rechazó' },
    });

    render(<SourceControlPanel />);

    expect(screen.getByRole('alert').textContent).toBe('el hook lo rechazó');
  });
});

describe('el formulario de commit', () => {
  /** Un repositorio con un archivo preparado, que es lo que habilita el botón. */
  function withStaged(): void {
    useGitStore.setState({
      repository: repository([change('src/a.ts', { index: 'modified' })]),
    });
  }

  it('no ofrece commitear sin nada preparado', () => {
    useGitStore.setState({
      repository: repository([change('src/a.ts', { worktree: 'modified' })]),
      commitMessage: 'feat: algo',
    });

    render(<SourceControlPanel />);

    // Más honesto que dejar apretar el botón para recibir un "nothing to
    // commit" que ya sabíamos.
    expect(screen.getByTestId('git-commit').hasAttribute('disabled')).toBe(true);
  });

  it('no ofrece commitear sin mensaje', () => {
    withStaged();
    useGitStore.setState({ commitMessage: '   ' });

    render(<SourceControlPanel />);

    expect(screen.getByTestId('git-commit').hasAttribute('disabled')).toBe(true);
  });

  it('no ofrece commitear mientras hay una operación en curso', () => {
    withStaged();
    useGitStore.setState({ commitMessage: 'feat: algo', isBusy: true });

    render(<SourceControlPanel />);

    expect(screen.getByTestId('git-commit').hasAttribute('disabled')).toBe(true);
  });

  it('guarda en el store lo que se escribe', async () => {
    withStaged();

    render(<SourceControlPanel />);
    await userEvent.type(screen.getByTestId('git-message'), 'feat');

    expect(useGitStore.getState().commitMessage).toBe('feat');
  });

  it('commitea con el mensaje escrito', async () => {
    withStaged();
    useGitStore.setState({ commitMessage: 'feat: algo' });

    render(<SourceControlPanel />);
    await userEvent.click(screen.getByTestId('git-commit'));

    expect(invoke).toHaveBeenCalledWith('git:commit', { message: 'feat: algo' });
  });
});
