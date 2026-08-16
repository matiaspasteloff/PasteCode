import { t } from '../../i18n/index.js';
import { useEditorStatusStore } from '../../stores/editor-status-store.js';
import { useSettingsStore } from '../../stores/settings-store.js';

/**
 * `Espacios: 2` o `Tabulaciones: 4`.
 *
 * Sale de las settings y no del modelo de Monaco porque es la settings la que
 * manda: `useEditorSettings` se la aplica a cada modelo. Leer el modelo sería
 * leer el reflejo en vez de la fuente, y mostraría el valor viejo durante el
 * tick que va entre que la settings cambia y que el modelo se entera.
 */
export function StatusIndentation(): React.JSX.Element | null {
  const line = useEditorStatusStore((state) => state.line);
  const { tabSize, insertSpaces } = useSettingsStore((state) => state.settings.editor);

  // Sin archivo abierto no hay nada que indentar.
  if (line === null) return null;

  return (
    <span className="status-bar__item" data-testid="status-indentation">
      {`${insertSpaces ? t('status.spaces') : t('status.tabs')}: ${String(tabSize)}`}
    </span>
  );
}
