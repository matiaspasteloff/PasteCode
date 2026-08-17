import { useMemo, useState } from 'react';

import { QuickPick } from '../../components/QuickPick.js';
import { t } from '../../i18n/index.js';
import { useGitStore } from '../../stores/git-store.js';

/**
 * El selector de ramas ([RF-604](../../../../../docs/03-requerimientos-funcionales.md)).
 *
 * Reusa el mismo `QuickPick` que la paleta de comandos y quick open. Es la
 * tercera vez que ese componente se usa sin tocarlo, que era el punto de
 * haberlo generalizado.
 *
 * El filtro es `includes` y no `fuzzyMatch`: los nombres de rama son cortos y
 * ya vienen agrupados por prefijo —`feature/x`, `fix/y`—, así que una
 * coincidencia difusa mezcla los grupos en vez de acercar lo que se busca.
 */
export function BranchPicker(): React.JSX.Element | null {
  const isOpen = useGitStore((state) => state.isBranchPickerOpen);
  const branches = useGitStore((state) => state.branches);
  const close = useGitStore((state) => state.closeBranchPicker);
  const checkout = useGitStore((state) => state.checkout);

  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return needle === ''
      ? branches
      : branches.filter((branch) => branch.toLowerCase().includes(needle));
  }, [query, branches]);

  return (
    <QuickPick
      isOpen={isOpen}
      items={matches}
      getKey={(branch) => branch}
      getLabel={(branch) => branch}
      query={query}
      onQueryChange={setQuery}
      onPick={(branch) => {
        setQuery('');
        void checkout(branch);
      }}
      onClose={close}
      placeholder={t('git.branchPlaceholder')}
      label={t('git.branchLabel')}
      emptyLabel={t('git.branchEmpty')}
    />
  );
}
