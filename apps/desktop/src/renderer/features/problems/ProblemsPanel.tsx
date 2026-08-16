import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef } from 'react';

import { t } from '../../i18n/index.js';
import { useEditorStore } from '../../stores/editor-store.js';
import { failedServers, useLspStatusStore } from '../../stores/lsp-status-store.js';
import { useProblemsStore } from '../../stores/problems-store.js';
import { useWorkspaceStore } from '../../stores/workspace-store.js';
import { revealPosition } from '../editor/navigation.js';
import { splitDisplayPath } from '../search/search-rows.js';

import type { ProblemRow } from './problem-rows.js';
import { flattenProblemRows } from './problem-rows.js';

/** Alto de fila, en píxeles. Coincide con el CSS. */
const ROW_HEIGHT = 22;

/**
 * El panel de problemas ([RF-403](../../../../../docs/03-requerimientos-funcionales.md)).
 *
 * Reusa el CSS de lienzo con filas absolutas de `.search-panel__results`: es
 * el mismo problema —una lista larga agrupada por archivo, virtualizada— y
 * escribir un segundo juego de reglas idénticas sería tener dos lugares donde
 * arreglar el mismo alto de fila.
 *
 * Muestra además los servidores que fallaron. La diferencia entre "este
 * proyecto no tiene errores" y "no hay quien los busque" es demasiado grande
 * como para dejarla en un panel vacío.
 */
export function ProblemsPanel(): React.JSX.Element {
  const byPath = useProblemsStore((state) => state.byPath);
  const servers = useLspStatusStore((state) => state.servers);
  const root = useWorkspaceStore((state) => state.workspace?.root ?? '');
  const scrollRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => flattenProblemRows(byPath), [byPath]);
  const failed = useMemo(() => failedServers(servers), [servers]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  return (
    <section className="problems-panel" aria-label={t('problems.panel')}>
      {failed.map((server) => (
        <p key={server.serverId} className="problems-panel__error" role="alert">
          {server.userMessage ?? t('problems.serverFailed')}
        </p>
      ))}

      {rows.length === 0 && <p className="problems-panel__empty">{t('problems.empty')}</p>}

      <div ref={scrollRef} className="search-panel__results">
        <div className="search-panel__canvas" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];

            if (row === undefined) return null;

            return <Row key={rowKey(row)} row={row} offset={item.start} root={root} />;
          })}
        </div>
      </div>
    </section>
  );
}

/** Una fila: encabezado de archivo o un problema clickeable. */
function Row({
  row,
  offset,
  root,
}: {
  row: ProblemRow;
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
        <span className="search-panel__file-count">
          {row.truncated ? `${String(row.problemCount)}+` : row.problemCount}
        </span>
      </div>
    );
  }

  const { start } = row.diagnostic.range;

  return (
    <button
      type="button"
      className="search-panel__match"
      style={style}
      data-testid="problem-row"
      onClick={() => {
        // Mismo camino que un resultado de búsqueda: la posición se anota antes
        // de abrir, y `revealPosition` la aplica en el momento si el archivo ya
        // era la pestaña activa.
        revealPosition(row.path, start.line, start.column);
        void useEditorStore.getState().open(row.path);
      }}
    >
      <span
        className={`problems-panel__severity problems-panel__severity--${row.diagnostic.severity}`}
      />
      <span className="search-panel__match-preview">{row.diagnostic.message}</span>
      <span className="search-panel__match-line">{start.line}</span>
    </button>
  );
}

/** Una clave estable por fila, para que React no reordene mal. */
function rowKey(row: ProblemRow): string {
  if (row.kind === 'file') return `file:${row.path}`;

  const { start } = row.diagnostic.range;

  return `problem:${row.path}:${String(start.line)}:${String(start.column)}:${row.diagnostic.message}`;
}
