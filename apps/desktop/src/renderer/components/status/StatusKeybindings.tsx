import { t } from '../../i18n/index.js';
import { useKeybindingsStore } from '../../stores/keybindings-store.js';
import { IconError } from '../icons/IconError.js';

/**
 * Avisa que el `keybindings.json` tiene conflictos, o que no se pudo leer.
 *
 * Es la mitad de [RF-702](../../../../../docs/03-requerimientos-funcionales.md)
 * que pide **reportar** los conflictos: detectarlos y no decirlo deja a alguien
 * apretando una tecla que hace otra cosa sin ninguna pista de por qué.
 *
 * **No se muestra cuando no hay nada que decir.** Un indicador permanente en
 * cero es ruido en una barra donde cada elemento compite por el mismo espacio
 * con la posición del cursor y la rama de git.
 *
 * El detalle va en el `title` y no en un panel propio: son una o dos líneas y
 * la acción que siguen —abrir el archivo y corregirlo— pasa afuera de la app.
 */
export function StatusKeybindings(): React.JSX.Element | null {
  const conflicts = useKeybindingsStore((state) => state.conflicts);
  const error = useKeybindingsStore((state) => state.error);

  if (error === null && conflicts.length === 0) return null;

  const detail =
    error !== null
      ? error.userMessage
      : conflicts
          .map((conflict) => `${conflict.key}: ${conflict.commands.join(', ')}`)
          .join('\n');

  return (
    <span
      className="status-bar__item status-bar__item--warning"
      title={detail}
      data-testid="status-keybindings"
    >
      <IconError size={12} />
      {error !== null ? t('keybindings.fileError') : t('keybindings.conflicts')}
      {error === null && ` (${String(conflicts.length)})`}
    </span>
  );
}
