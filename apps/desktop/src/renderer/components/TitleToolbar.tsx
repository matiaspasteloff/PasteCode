import { t } from '../i18n/index.js';
import { useCommandStore } from '../stores/command-store.js';
import { useViewStore } from '../stores/view-store.js';
import { useWorkspaceStore } from '../stores/workspace-store.js';

import { IconAi } from './icons/IconAi.js';
import { IconCommand } from './icons/IconCommand.js';
import { MenuBar } from './MenuBar.js';
import { WindowControls } from './WindowControls.js';

/**
 * La barra de título: menús, caja de comandos, asistente y botones de ventana.
 *
 * **Reemplaza al marco nativo de Windows**, que es lo que decidió
 * [ADR-0030](../../../../../docs/adr/0030-barra-de-titulo-propia.md) derogando
 * la parte de ADR-0022 que lo defendía. El argumento de aquel ADR —que un
 * marco propio obliga a reimplementar arrastre, snap y doble click— sigue
 * siendo cierto, pero eso lo resuelve `-webkit-app-region` en el CSS sin una
 * línea de JavaScript, y lo que había del otro lado creció: sin barra propia
 * no hay dónde poner los menús.
 *
 * Los bloques y su orden son los de VS Code, y no por copiar: los menús a la
 * izquierda es donde los busca cualquiera en Windows, la caja de comandos
 * centrada es lo único que se puede centrar respecto de la ventana, y los
 * botones de ventana van donde el sistema operativo los pone. El asistente va
 * pegado a los botones de ventana porque es lo que abre y cierra la columna de
 * ese mismo lado.
 *
 * El arrastre lo da `.title-toolbar { -webkit-app-region: drag }`, y **cada
 * hijo interactivo lleva `no-drag`** por una regla que los cubre a todos. Es
 * el error clásico de esta feature: un botón sin eso no se puede clickear, y
 * el síntoma no se parece a la causa. Por eso el asistente es un `<button>` y
 * no un `<div>` clickeable: la regla del CSS cubre `button`, `input`, `select`
 * y `[role='menu']`, y nada más.
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

      <AiToggle />

      <WindowControls />
    </header>
  );
}

/**
 * El botón que abre y cierra el panel del asistente.
 *
 * **Dispara el comando y no la acción del store**, igual que el rail de
 * actividades y por la misma regla de ADR-0022: si el botón y el atajo no
 * pasan por el mismo lugar, divergen. `ai.toggle` ya existía y ya estaba en el
 * menú Ayuda, así que esto no toca ni el registro de comandos ni el de menús.
 */
function AiToggle(): React.JSX.Element {
  const isOpen = useViewStore((state) => state.auxView === 'ai');
  const run = useCommandStore((state) => state.run);

  return (
    <button
      type="button"
      className="title-toolbar__ai"
      // Se aprieta y se suelta —clickearlo con el panel abierto lo cierra—, así
      // que es `aria-pressed` y no un tab (RNF-23). El icono no dice nada por
      // sí solo: sin el label, un lector de pantalla anuncia un botón vacío.
      aria-pressed={isOpen}
      aria-label={t('view.ai')}
      title={t('view.ai')}
      data-testid="toolbar-ai"
      data-active={isOpen}
      onClick={() => {
        void run('ai.toggle');
      }}
    >
      <IconAi size={16} />
    </button>
  );
}
