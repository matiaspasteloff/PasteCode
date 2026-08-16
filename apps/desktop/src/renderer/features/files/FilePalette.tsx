import { rankFiles } from '@pastecode/core';
import { useMemo, useState } from 'react';

import { QuickPick } from '../../components/QuickPick.js';
import { t } from '../../i18n/index.js';
import { useEditorStore } from '../../stores/editor-store.js';
import { useFileIndexStore } from '../../stores/file-index-store.js';

/**
 * Cuántos candidatos se le pasan al `QuickPick`.
 *
 * El presupuesto de [RF-205](../../../../../docs/03-requerimientos-funcionales.md#búsqueda-en-workspace)
 * son 50ms para los primeros resultados. Nadie baja más allá de las primeras
 * decenas, así que ordenar veinte mil y quedarse con cincuenta es gratis
 * comparado con dejar que la lista los tenga todos.
 */
const MAX_RESULTS = 50;

/**
 * Quick open (`Ctrl+P`): abrir un archivo escribiendo parte de su nombre.
 *
 * Reusa el mismo `QuickPick` que la paleta de comandos y el mismo `fuzzyMatch`
 * de `packages/core`. Lo único propio es el orden: `rankFiles` premia las
 * coincidencias en el nombre del archivo por sobre las de la carpeta.
 */
export function FilePalette(): React.JSX.Element | null {
  const isOpen = useFileIndexStore((state) => state.isOpen);
  const files = useFileIndexStore((state) => state.files);
  const close = useFileIndexStore((state) => state.close);

  const [query, setQuery] = useState('');

  const matches = useMemo(() => rankFiles(query, files, MAX_RESULTS), [query, files]);

  return (
    <QuickPick
      isOpen={isOpen}
      items={matches}
      getKey={(file) => file.path}
      getLabel={(file) => fileName(file.relativePath)}
      getDetail={(file) => folderOf(file.relativePath)}
      query={query}
      onQueryChange={setQuery}
      onPick={(file) => {
        close();
        void useEditorStore.getState().open(file.path);
      }}
      onClose={close}
      placeholder={t('quickOpen.placeholder')}
      label={t('quickOpen.label')}
      emptyLabel={t('quickOpen.empty')}
    />
  );
}

/** El último segmento de una ruta relativa. */
function fileName(relativePath: string): string {
  const cut = relativePath.lastIndexOf('/');

  return cut === -1 ? relativePath : relativePath.slice(cut + 1);
}

/** Todo menos el último segmento. Vacío si el archivo está en la raíz. */
function folderOf(relativePath: string): string {
  const cut = relativePath.lastIndexOf('/');

  return cut === -1 ? '' : relativePath.slice(0, cut);
}
