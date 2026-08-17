import { t } from '../../i18n/index.js';
import { useGitStore } from '../../stores/git-store.js';
import { IconGit } from '../icons/IconGit.js';

/**
 * La rama actual y el ahead/behind, con el selector de ramas al clickear.
 *
 * **No se dibuja si no hay repositorio**, que es también el caso de "no hay git
 * instalado" y el de "`git.enabled` está apagado". Un indicador vacío ocuparía
 * lugar para no decir nada.
 *
 * El ahead/behind sale gratis del mismo `git status --branch` que llena el
 * panel: no cuesta un comando aparte.
 */
export function StatusBranch(): React.JSX.Element | null {
  const repository = useGitStore((state) => state.repository);
  const openBranchPicker = useGitStore((state) => state.openBranchPicker);

  if (repository === null) return null;

  const { branch } = repository;

  return (
    <button
      type="button"
      className="status-bar__button"
      title={t('git.branchLabel')}
      aria-label={t('git.branchLabel')}
      data-testid="status-branch"
      onClick={() => {
        void openBranchPicker();
      }}
    >
      <IconGit size={12} />
      <span className="status-bar__item">{branch.name ?? t('git.detached')}</span>
      {(branch.ahead > 0 || branch.behind > 0) && (
        <span className="status-bar__item" data-testid="status-branch-ab">
          ↑{branch.ahead} ↓{branch.behind}
        </span>
      )}
    </button>
  );
}
