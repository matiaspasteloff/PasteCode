import { useMemo } from 'react';

import { t } from '../../i18n/index.js';
import { countProblems, useProblemsStore } from '../../stores/problems-store.js';
import { useViewStore } from '../../stores/view-store.js';
import { IconError } from '../icons/IconError.js';
import { IconProblems } from '../icons/IconProblems.js';

/**
 * Los conteos de errores y advertencias, y el atajo al panel.
 *
 * Se suscribe **sólo al mapa de problemas**, que cambia una vez por lote de
 * diagnósticos y no una vez por tecla: es la misma razón por la que
 * `StatusPosition` tiene su propio store. Los conteos se derivan en un `useMemo`
 * y no se guardan, porque son estado derivado (regla 5 de `codigo.md`).
 */
export function StatusProblems(): React.JSX.Element {
  const byPath = useProblemsStore((state) => state.byPath);
  const showPanel = useViewStore((state) => state.showPanel);

  const counts = useMemo(() => countProblems(byPath), [byPath]);

  return (
    <button
      type="button"
      className="status-bar__button"
      title={t('problems.panel')}
      aria-label={t('problems.panel')}
      data-testid="status-problems"
      onClick={() => {
        showPanel('problems');
      }}
    >
      <IconError size={12} />
      <span className="status-bar__item">{counts.errors}</span>
      <IconProblems size={12} />
      <span className="status-bar__item">{counts.warnings}</span>
    </button>
  );
}
