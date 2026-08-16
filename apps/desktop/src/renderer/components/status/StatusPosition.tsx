import { t } from '../../i18n/index.js';
import { useEditorStatusStore } from '../../stores/editor-status-store.js';

/**
 * `Ln 12, Col 4`.
 *
 * Es un componente propio y no un fragmento de `StatusBar` **por rendimiento**:
 * se suscribe al store de estado del editor, que cambia con cada movimiento del
 * cursor. Al estar aislado, ese cambio repinta doce caracteres y no la barra
 * entera. Ver `stores/editor-status-store.ts`.
 */
export function StatusPosition(): React.JSX.Element | null {
  const line = useEditorStatusStore((state) => state.line);
  const column = useEditorStatusStore((state) => state.column);

  if (line === null || column === null) return null;

  return (
    <span className="status-bar__item" data-testid="status-position">
      {`${t('status.line')} ${String(line)}, ${t('status.column')} ${String(column)}`}
    </span>
  );
}
