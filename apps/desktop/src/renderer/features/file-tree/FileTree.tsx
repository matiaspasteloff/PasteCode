import { flattenVisibleNodes } from '@pastecode/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef } from 'react';

import { t } from '../../i18n/index.js';
import { useFileTreeStore } from '../../stores/file-tree-store.js';
import { useGitStore } from '../../stores/git-store.js';
import { decorationsByPath, normalizePath } from '../git/git-rows.js';

import { FileTreeRow } from './FileTreeRow.js';
import { useTreeNavigation } from './use-tree-navigation.js';

/** Alto de fila, en píxeles. Coincide con `--file-tree-row-height`. */
const ROW_HEIGHT = 22;

interface FileTreeProps {
  /** Ruta del archivo abierto, para marcarlo. */
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}

/**
 * Árbol de archivos del workspace.
 *
 * Virtualizado desde el primer día porque la
 * [convención de React](../../../../../../docs/convenciones/codigo.md#reglas-de-react)
 * lo exige para listas de más de 100 ítems, y el árbol de este mismo
 * repositorio ya pasa esa marca.
 */
export function FileTree({ selectedPath, onSelectFile }: FileTreeProps): React.JSX.Element {
  const roots = useFileTreeStore((state) => state.roots);
  const expandedPaths = useFileTreeStore((state) => state.expandedPaths);
  const isLoading = useFileTreeStore((state) => state.isLoading);
  const toggleFolder = useFileTreeStore((state) => state.toggleFolder);
  const repository = useGitStore((state) => state.repository);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Derivado en el render y no en un useEffect: es exactamente el caso que la
  // regla 5 de React señala.
  const rows = useMemo(() => flattenVisibleNodes(roots, expandedPaths), [roots, expandedPaths]);
  // Se arma una vez por refresco de git y no una vez por fila: git informa
  // rutas relativas a la raíz del repositorio y el árbol tiene absolutas del
  // sistema operativo, así que la traducción tiene que pasar en algún lado.
  const decorations = useMemo(() => decorationsByPath(repository), [repository]);

  const { focusedIndex, activate, handleKeyDown } = useTreeNavigation(
    rows,
    onSelectFile,
    toggleFolder
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  if (isLoading) return <p className="file-tree__status">{t('fileTree.loading')}</p>;
  if (rows.length === 0) return <p className="file-tree__status">{t('fileTree.empty')}</p>;

  return (
    <div
      ref={scrollRef}
      role="tree"
      aria-label={t('fileTree.label')}
      className="file-tree"
      onKeyDown={handleKeyDown}
    >
      <div className="file-tree__canvas" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const visible = rows[item.index];
          if (visible === undefined) return null;

          return (
            <FileTreeRow
              key={visible.node.path}
              visible={visible}
              offset={item.start}
              isFocused={item.index === focusedIndex}
              isSelected={visible.node.path === selectedPath}
              gitStatus={decorations.get(normalizePath(visible.node.path)) ?? null}
              onActivate={activate}
            />
          );
        })}
      </div>
    </div>
  );
}
