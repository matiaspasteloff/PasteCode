import { DebugPanel } from '../features/debug/DebugPanel.js';
import { ProblemsPanel } from '../features/problems/ProblemsPanel.js';
import { TerminalPanel } from '../features/terminal/TerminalPanel.js';
import { TerminalTabs } from '../features/terminal/TerminalTabs.js';
import type { TranslationKey } from '../i18n/index.js';
import type { PanelView } from '../stores/view-store.js';

import type { IconProps } from './icons/Icon.js';
import { IconDebug } from './icons/IconDebug.js';
import { IconProblems } from './icons/IconProblems.js';
import { IconTerminal } from './icons/IconTerminal.js';

/** Todo lo que el panel inferior necesita saber de una de sus pestañas. */
export interface PanelViewDescriptor {
  readonly id: PanelView;
  readonly labelKey: TranslationKey;
  readonly Icon: (props: IconProps) => React.JSX.Element;
  readonly render: () => React.JSX.Element;
  /**
   * Controles propios, al extremo derecho de la barra de pestañas.
   *
   * Existe porque la tira de terminales de RF-302 vive ahí, como en VS Code, y
   * la alternativa era una segunda fila de cromo debajo de la primera. Se
   * dibujan **sólo con esa pestaña activa**, y es una entrada más del
   * descriptor y no un caso especial adentro de `BottomPanel`: el panel sigue
   * sin conocer a ninguno de sus inquilinos, que es el punto del registro
   * ([ADR-0022](../../../../../docs/adr/0022-cascaron-con-barra-de-actividades.md)).
   */
  readonly Actions?: () => React.JSX.Element;
}

/**
 * Las pestañas del panel inferior, en orden.
 *
 * Mismo registro que el de las vistas laterales y por la misma razón: el panel
 * no conoce a sus inquilinos, los recorre. El panel de problemas entró acá como
 * una entrada más y ésa es toda la prueba que este diseño necesitaba.
 *
 * @example
 * for (const panel of PANEL_VIEW_REGISTRY) renderTab(panel);
 */
export const PANEL_VIEW_REGISTRY: readonly PanelViewDescriptor[] = [
  {
    id: 'problems',
    labelKey: 'problems.panel',
    Icon: IconProblems,
    render: () => <ProblemsPanel />,
  },
  {
    id: 'terminal',
    labelKey: 'terminal.panel',
    Icon: IconTerminal,
    render: () => <TerminalPanel />,
    Actions: TerminalTabs,
  },
  {
    id: 'debug',
    labelKey: 'debug.panel',
    Icon: IconDebug,
    render: () => <DebugPanel />,
  },
];
