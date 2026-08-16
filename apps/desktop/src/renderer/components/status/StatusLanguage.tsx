import { useEditorStatusStore } from '../../stores/editor-status-store.js';

/**
 * El lenguaje del archivo activo.
 *
 * Muestra **lo que Monaco decidió**, no lo que una tabla nuestra suponga. Monaco
 * resuelve la extensión mucho mejor que cualquier lista que escribamos —es la
 * misma razón por la que `languageOverrideFor` devuelve `undefined` casi
 * siempre—, así que el id viaja desde el modelo hasta acá sin que nadie lo
 * reinterprete.
 */
export function StatusLanguage(): React.JSX.Element | null {
  const languageId = useEditorStatusStore((state) => state.languageId);

  if (languageId === null) return null;

  return (
    <span className="status-bar__item" data-testid="status-language">
      {languageId}
    </span>
  );
}
