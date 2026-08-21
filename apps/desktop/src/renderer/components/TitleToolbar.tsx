import { t } from '../i18n/index.js';
import { useCommandStore } from '../stores/command-store.js';
import { useWorkspaceStore } from '../stores/workspace-store.js';

import { IconCommand } from './icons/IconCommand.js';
import { MenuBar } from './MenuBar.js';
import { WindowControls } from './WindowControls.js';

/**
 * La barra de título: menús, caja de comandos y botones de ventana.
 *
 * **Reemplaza al marco nativo de Windows**, que es lo que decidió
 * [ADR-0030](../../../../../docs/adr/0030-barra-de-titulo-propia.md) derogando
 * la parte de ADR-0022 que lo defendía. El argumento de aquel ADR —que un
 * marco propio obliga a reimplementar arrastre, snap y doble click— sigue
 * siendo cierto, pero eso lo resuelve `-webkit-app-region` en el CSS sin una
 * línea de JavaScript, y lo que había del otro lado creció: sin barra propia
 * no hay dónde poner los menús.
 *
 * Los tres bloques y su orden son los de VS Code, y no por copiar: los menús a
 * la izquierda es donde los busca cualquiera en Windows, la caja de comandos
 * centrada es lo único que se puede centrar respecto de la ventana, y los
 * botones de ventana van donde el sistema operativo los pone.
 *
 * El arrastre lo da `.title-toolbar { -webkit-app-region: drag }`, y **cada
 * hijo interactivo lleva `no-drag`** por una regla que los cubre a todos. Es
 * el error clásico de esta feature: un botón sin eso no se puede clickear, y
 * el síntoma no se parece a la causa.
 */
export function TitleToolbar(): React.JSX.Element {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const openPalette = useCommandStore((state) => state.openPalette);

  return (
    <header className="title-toolbar">
      <MenuBar />

      <button
        type="button"
        className="title-toolbar__commands"
        data-testid="toolbar-commands"
        onClick={openPalette}
      >
        <IconCommand size={14} />
        <span className="title-toolbar__project" data-testid="toolbar-project">
          {workspace?.name ?? t('workspace.emptyTitle')}
        </span>
      </button>

      <WindowControls />
    </header>
  );
}
