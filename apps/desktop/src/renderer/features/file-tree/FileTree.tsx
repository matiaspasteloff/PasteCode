import type { GitFileStatus, VisibleNode } from '@pastecode/core';
import { flattenVisibleNodes } from '@pastecode/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef } from 'react';

import { t } from '../../i18n/index.js';
import { useFileTreeStore } from '../../stores/file-tree-store.js';
import { useGitStore } from '../../stores/git-store.js';
import { decorationsByPath, normalizePath } from '../git/git-rows.js';

import { FileTreeEditRow } from './FileTreeEditRow.js';
import { FileTreeRow } from './FileTreeRow.js';
import type { TreeRow } from './tree-rows.js';
import { treeRowsWithEdit } from './tree-rows.js';
import { useTreeNavigation } from './use-tree-navigation.js';

/** Alto de fila, en píxeles. Coincide con `--file-tree-row-height`. */
const ROW_HEIGHT = 22;

interface FileTreeProps {
  /** Ruta del archivo abierto, para marcarlo. */
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}

/**
 * La fila del campo de texto, ya cableada al store.
 *
 * `FileTreeEditRow` se queda presentacional —recibe qué hacer por props y se
 * testea sin store— y el cableado vive acá, que es un componente de una sola
 * responsabilidad. De paso deja a `FileTree` dentro del límite de líneas de
 * RNF-20.
 */
function ConnectedEditRow({
  row,
  offset,
}: {
  row: Extract<TreeRow, { kind: 'edit' }>;
  offset: number;
}): React.JSX.Element {
  const cancelEdit = useFileTreeStore((state) => state.cancelEdit);
  const commitEdit = useFileTreeStore((state) => state.commitEdit);

  return (
    <FileTreeEditRow
      initialName={row.initialName}
      depth={row.depth}
      offset={offset}
      isDirectory={row.isDirectory}
      onCommit={(name) => {
        void commitEdit(name);
      }}
      onCancel={cancelEdit}
    />
  );
}

interface TreeCanvasProps {
  renderRows: readonly TreeRow[];
  /** Las filas de nodos, sin la de edición: contra ésta se mide el foco. */
  rows: readonly VisibleNode[];
  focusedIndex: number;
  selectedPath: string | null;
  decorations: ReadonlyMap<string, GitFileStatus>;
  onActivate: (visible: VisibleNode) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}

/**
 * El contenedor con scroll y las filas virtualizadas.
 *
 * Está separado de `FileTree` porque el contenedor ya tiene bastante con leer
 * los stores y derivar las filas: juntos pasan el límite de líneas de RNF-20,
 * que es exactamente el aviso de que son dos cosas.
 *
 * **El `ref` del scroll vive acá y no en `FileTree`**, y no es una preferencia:
 * React adjunta los refs de abajo hacia arriba, así que un `ref` declarado en el
 * padre todavía es `null` cuando corren los efectos del hijo. Con el
 * virtualizador acá y el `ref` allá, medía contra `null` y el árbol se pintaba
 * sin una sola fila.
 */
function TreeCanvas({
  renderRows,
  rows,
  focusedIndex,
  selectedPath,
  decorations,
  onActivate,
  onKeyDown,
}: TreeCanvasProps): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: renderRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  return (
    <div
      ref={scrollRef}
      role="tree"
      aria-label={t('fileTree.label')}
      className="file-tree"
      onKeyDown={onKeyDown}
    >
      <div className="file-tree__canvas" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = renderRows[item.index];
          if (row === undefined) return null;

          if (row.kind === 'edit') {
            return <ConnectedEditRow key="file-tree-edit" row={row} offset={item.start} />;
          }

          const { visible } = row;

          return (
            <FileTreeRow
              key={visible.node.path}
              visible={visible}
              offset={item.start}
              // El índice enfocado es el de `rows`, no el de `renderRows`: con un
              // campo de creación abierto los dos se corren uno respecto del otro,
              // y comparar contra el índice equivocado le pondría el `tabIndex` a
              // la fila de al lado.
              isFocused={rows.indexOf(visible) === focusedIndex}
              isSelected={visible.node.path === selectedPath}
              gitStatus={decorations.get(normalizePath(visible.node.path)) ?? null}
              onActivate={onActivate}
            />
          );
        })}
      </div>
    </div>
  );
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
  const edit = useFileTreeStore((state) => state.edit);
  const repository = useGitStore((state) => state.repository);

  // Derivado en el render y no en un useEffect: es exactamente el caso que la
  // regla 5 de React señala.
  const rows = useMemo(() => flattenVisibleNodes(roots, expandedPaths), [roots, expandedPaths]);
  // La navegación con teclado sigue viendo sólo los nodos de verdad: la fila
  // del campo no es un destino al que se pueda llegar con las flechas, porque
  // mientras está abierta el foco vive adentro del input.
  const renderRows = useMemo(() => treeRowsWithEdit(rows, edit), [rows, edit]);
  // Se arma una vez por refresco de git y no una vez por fila: git informa
  // rutas relativas a la raíz del repositorio y el árbol tiene absolutas del
  // sistema operativo, así que la traducción tiene que pasar en algún lado.
  const decorations = useMemo(() => decorationsByPath(repository), [repository]);

  const { focusedIndex, activate, handleKeyDown } = useTreeNavigation(
    rows,
    onSelectFile,
    toggleFolder
  );

  if (isLoading) return <p className="file-tree__status">{t('fileTree.loading')}</p>;
  // Con una edición abierta el árbol se pinta aunque esté vacío: crear el
  // primer archivo de una carpeta vacía es justamente uno de los casos, y el
  // cartel de "está vacía" taparía el campo.
  if (renderRows.length === 0)
    return <p className="file-tree__status">{t('fileTree.empty')}</p>;

  return (
    <TreeCanvas
      renderRows={renderRows}
      rows={rows}
      focusedIndex={focusedIndex}
      selectedPath={selectedPath}
      decorations={decorations}
      onActivate={activate}
      onKeyDown={handleKeyDown}
    />
  );
}
