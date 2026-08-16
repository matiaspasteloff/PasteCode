import { t } from '../i18n/index.js';
import { useCommandStore } from '../stores/command-store.js';
import { useWorkspaceStore } from '../stores/workspace-store.js';

import { IconCommand } from './icons/IconCommand.js';

/**
 * La barra superior: el proyecto abierto y el botón de comandos.
 *
 * **Va debajo del marco nativo de Windows, no en lugar de él.** Reemplazar la
 * barra de título obliga a `frame: false` y a reimplementar arrastre, snap a
 * los bordes, doble click para maximizar y los botones de ventana, en tres
 * plataformas — una cantidad de trabajo desproporcionada para una franja de
 * 30px, y el marco nativo no es un problema que alguien tenga.
 * Ver [ADR-0022](../../../../../docs/adr/0022-cascaron-con-barra-de-actividades.md).
 *
 * El slot de la derecha queda deliberadamente vacío hasta que Git exista: ahí
 * va la rama. Ponerle un placeholder sería inventar UI que no representa nada.
 */
export function TitleToolbar(): React.JSX.Element {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const openPalette = useCommandStore((state) => state.openPalette);

  return (
    <header className="title-toolbar">
      <span className="title-toolbar__project" data-testid="toolbar-project">
        {workspace?.name ?? t('workspace.emptyTitle')}
      </span>

      <button
        type="button"
        className="title-toolbar__commands"
        data-testid="toolbar-commands"
        onClick={openPalette}
      >
        <IconCommand size={14} />
        {t('palette.placeholder')}
      </button>

      <div className="title-toolbar__end" />
    </header>
  );
}
