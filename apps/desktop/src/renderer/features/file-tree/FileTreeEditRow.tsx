import { useEffect, useRef } from 'react';

import { IconFile } from '../../components/icons/IconFile.js';
import { IconFolder } from '../../components/icons/IconFolder.js';
import { t } from '../../i18n/index.js';

/** Sangrado por nivel. El mismo que `FileTreeRow`. */
const INDENT_REM = 0.75;

/**
 * Enfoca el campo al aparecer y deja seleccionado el nombre sin la extensión.
 *
 * Lo de la extensión no es un adorno: al renombrar `componente.tsx` lo que se
 * quiere cambiar es casi siempre `componente`, y dejar `.tsx` adentro de la
 * selección obliga a volver a escribirla cada vez.
 */
function useFocusedName(initialName: string): React.RefObject<HTMLInputElement | null> {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (input === null) return;

    input.focus();

    const dot = initialName.lastIndexOf('.');

    input.setSelectionRange(0, dot > 0 ? dot : initialName.length);
  }, [initialName]);

  return inputRef;
}

interface FileTreeEditRowProps {
  /** Nombre con el que arranca el campo. Vacío al crear. */
  initialName: string;
  /** Nivel en el árbol, para alinearla con las filas de alrededor. */
  depth: number;
  /** Desplazamiento vertical que le asignó el virtualizador, en píxeles. */
  offset: number;
  /** Qué ícono mostrar mientras se escribe el nombre. */
  isDirectory: boolean;
  onCommit: (name: string) => void;
  onCancel: () => void;
}

/**
 * La fila del árbol cuando es un campo de texto: crear o renombrar.
 *
 * Es una fila aparte y no un modo de `FileTreeRow` para que esa fila —que se
 * pinta cinco mil veces y está en el camino del presupuesto de RNF-06— no cargue
 * con estado de edición que casi nunca usa.
 *
 * **`Escape` cancela y `Enter` confirma**, que es lo que espera cualquiera que
 * abrió un campo sin querer. Perder el foco también confirma: es lo que hace
 * VS Code, y lo contrario —descartar lo escrito al hacer click afuera— es la
 * clase de cosa que hace perder un nombre largo recién tipeado.
 *
 * El `role="treeitem"` se mantiene para no dejar un hueco en la estructura del
 * árbol mientras el campo está abierto (RNF-23).
 */
export function FileTreeEditRow({
  initialName,
  depth,
  offset,
  isDirectory,
  onCommit,
  onCancel,
}: FileTreeEditRowProps): React.JSX.Element {
  const inputRef = useFocusedName(initialName);

  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={false}
      className="file-tree__row file-tree__row--editing"
      style={{
        paddingInlineStart: `${String(depth * INDENT_REM + 0.5)}rem`,
        transform: `translateY(${String(offset)}px)`,
      }}
    >
      <span className="file-tree__twisty" />
      <span className="file-tree__icon">
        {isDirectory ? (
          <IconFolder size={14} isExpanded={false} className="icon-file--folder" />
        ) : (
          <IconFile size={14} name={initialName} />
        )}
      </span>

      <input
        ref={inputRef}
        type="text"
        className="file-tree__input"
        aria-label={t('fileTree.nameLabel')}
        data-testid="file-tree-input"
        defaultValue={initialName}
        onKeyDown={(event) => {
          // No se deja subir al árbol: sin esto, escribir una `j` en el nombre
          // mueve el foco a la fila siguiente y las flechas navegan el árbol en
          // vez del texto.
          event.stopPropagation();

          if (event.key === 'Enter') onCommit(event.currentTarget.value);
          if (event.key === 'Escape') onCancel();
        }}
        onBlur={(event) => {
          onCommit(event.currentTarget.value);
        }}
      />
    </div>
  );
}
