import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef } from 'react';

import { useEditorStore } from '../../stores/editor-store.js';
import { useSearchStore } from '../../stores/search-store.js';
import { useWorkspaceStore } from '../../stores/workspace-store.js';
import { revealPosition } from '../editor/navigation.js';

import { flattenSearchRows, splitDisplayPath, type SearchRow } from './search-rows.js';

/** Alto de fila, en píxeles. Coincide con el CSS. */
const ROW_HEIGHT = 22;

/**
 * La lista de resultados, agrupada por archivo y virtualizada.
 *
 * Virtualizada porque `codigo.md` lo exige para más de 100 ítems, y una
 * búsqueda de una palabra común en este mismo repositorio pasa esa marca con
 * la primera letra. El agrupado de [RF-202](../../../../../docs/03-requerimientos-funcionales.md#búsqueda-en-workspace)
 * se dibuja como una lista plana con encabezados porque un virtualizador
 * necesita **una** lista con un alto por índice.
 */
export function SearchResults(): React.JSX.Element {
  const groups = useSearchStore((state) => state.groups);
  const root = useWorkspaceStore((state) => state.workspace?.root ?? '');
  const scrollRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => flattenSearchRows(groups), [groups]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  return (
    <div ref={scrollRef} className="search-panel__results">
      <div className="search-panel__canvas" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index];
          if (row === undefined) return null;

          return <Row key={rowKey(row)} row={row} offset={item.start} root={root} />;
        })}
      </div>
    </div>
  );
}

/** Una fila: encabezado de archivo o un match clickeable. */
function Row({
  row,
  offset,
  root,
}: {
  row: SearchRow;
  offset: number;
  root: string;
}): React.JSX.Element {
  const style = { transform: `translateY(${String(offset)}px)` };

  if (row.kind === 'file') {
    const { name, folder } = splitDisplayPath(row.path, root);

    return (
      <div className="search-panel__file" style={style}>
        <span className="search-panel__file-name">{name}</span>
        <span className="search-panel__file-folder">{folder}</span>
        <span className="search-panel__file-count">{row.matchCount}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="search-panel__match"
      style={style}
      onClick={() => {
        // La posición se anota **antes** de abrir: el editor la aplica al
        // montar el modelo, y si el archivo ya era la pestaña activa
        // `revealPosition` la aplica en el momento (RF-202).
        revealPosition(row.path, row.match.line, row.match.column);
        void useEditorStore.getState().open(row.path);
      }}
    >
      <span className="search-panel__match-line">{row.match.line}</span>
      <span className="search-panel__match-preview">{row.match.preview.trim()}</span>
    </button>
  );
}

/** Una clave estable por fila, para que React no reordene mal. */
function rowKey(row: SearchRow): string {
  return row.kind === 'file'
    ? `file:${row.path}`
    : `match:${row.path}:${String(row.match.line)}:${String(row.match.column)}`;
}
