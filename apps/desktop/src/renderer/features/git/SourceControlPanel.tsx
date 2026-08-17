import { useMemo } from 'react';

import { t } from '../../i18n/index.js';
import { useEditorStore } from '../../stores/editor-store.js';
import { useGitStore } from '../../stores/git-store.js';
import { revealPosition } from '../editor/navigation.js';

import type { GitRow } from './git-rows.js';
import { flattenGitRows, normalizePath } from './git-rows.js';

/**
 * La vista de control de código fuente ([RF-602](../../../../../docs/03-requerimientos-funcionales.md)
 * y [RF-603](../../../../../docs/03-requerimientos-funcionales.md)).
 *
 * **No está virtualizada**, y es la única lista del proyecto que no lo está.
 * `codigo.md` exige virtualizar por encima de los 100 ítems y esta lista no
 * llega: son los archivos que una persona cambió sin commitear. Un `git
 * checkout` de una rama muy vieja puede pasarlo, y en ese caso lo que hay que
 * hacer es commitear, no scrollear. Si algún día se demuestra lo contrario, el
 * lienzo virtualizado de la búsqueda está a tres líneas de acá.
 */
export function SourceControlPanel(): React.JSX.Element {
  const repository = useGitStore((state) => state.repository);
  const error = useGitStore((state) => state.error);

  const rows = useMemo(() => flattenGitRows(repository), [repository]);
  const hasStaged = rows.some((row) => row.kind === 'file' && row.section === 'staged');

  if (repository === null) {
    return (
      <section className="git-panel" aria-label={t('git.panel')}>
        <p className="git-panel__status">{t('git.noRepository')}</p>
      </section>
    );
  }

  return (
    <section className="git-panel" aria-label={t('git.panel')}>
      <CommitForm hasStaged={hasStaged} />

      {error !== null && (
        <p className="git-panel__error" role="alert">
          {error.userMessage}
        </p>
      )}

      {rows.length === 0 && <p className="git-panel__status">{t('git.clean')}</p>}

      <div className="git-panel__list">
        {rows.map((row) => (
          <Row key={rowKey(row)} row={row} root={repository.root} />
        ))}
      </div>
    </section>
  );
}

/** El mensaje y el botón. Se suscribe a lo que cambia con cada tecla. */
function CommitForm({ hasStaged }: { hasStaged: boolean }): React.JSX.Element {
  const commitMessage = useGitStore((state) => state.commitMessage);
  const isBusy = useGitStore((state) => state.isBusy);
  const setCommitMessage = useGitStore((state) => state.setCommitMessage);
  const commit = useGitStore((state) => state.commit);

  return (
    <>
      <textarea
        className="git-panel__message"
        aria-label={t('git.messagePlaceholder')}
        placeholder={t('git.messagePlaceholder')}
        data-testid="git-message"
        rows={2}
        value={commitMessage}
        onChange={(event) => {
          setCommitMessage(event.target.value);
        }}
      />

      <button
        type="button"
        className="git-panel__commit"
        data-testid="git-commit"
        // Sin nada preparado, `git commit` falla con "nothing to commit". Es
        // más honesto no ofrecer el botón que dejar que la persona lo apriete
        // para recibir un error que ya sabíamos.
        disabled={isBusy || !hasStaged || commitMessage.trim() === ''}
        onClick={() => {
          void commit();
        }}
      >
        {t('git.commit')}
      </button>
    </>
  );
}

/** Una fila: encabezado de grupo o un archivo con su acción. */
function Row({ row, root }: { row: GitRow; root: string }): React.JSX.Element {
  const stage = useGitStore((state) => state.stage);
  const unstage = useGitStore((state) => state.unstage);

  if (row.kind === 'section') {
    return (
      <div className="git-panel__section">
        <span>{t(row.section === 'staged' ? 'git.staged' : 'git.changes')}</span>
        <span className="git-panel__count">{row.count}</span>
      </div>
    );
  }

  const isStaged = row.section === 'staged';

  return (
    <div className="git-panel__row">
      <button
        type="button"
        className="git-panel__file"
        data-testid={`git-file-${row.path}`}
        onClick={() => {
          // Mismo camino que un resultado de búsqueda: se abre en la línea 1
          // porque git informa archivos, no posiciones.
          revealPosition(`${normalizePath(root)}/${row.path}`, 1, 1);
          void useEditorStore.getState().open(`${normalizePath(root)}/${row.path}`);
        }}
      >
        <span className={`git-panel__status-dot git-panel__status-dot--${row.status}`} />
        <span className="git-panel__file-name">{row.path}</span>
      </button>

      <button
        type="button"
        className="git-panel__action"
        aria-label={t(isStaged ? 'git.unstage' : 'git.stage')}
        title={t(isStaged ? 'git.unstage' : 'git.stage')}
        data-testid={`git-${isStaged ? 'unstage' : 'stage'}-${row.path}`}
        onClick={() => {
          void (isStaged ? unstage([row.path]) : stage([row.path]));
        }}
      >
        {isStaged ? '−' : '+'}
      </button>
    </div>
  );
}

/** Una clave estable por fila. Un archivo puede estar en los dos grupos. */
function rowKey(row: GitRow): string {
  return row.kind === 'section' ? `section:${row.section}` : `${row.section}:${row.path}`;
}
