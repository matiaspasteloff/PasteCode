import { TerminalPanel } from '../features/terminal/TerminalPanel.js';
import type { TranslationKey } from '../i18n/index.js';
import type { PanelView } from '../stores/view-store.js';

import type { IconProps } from './icons/Icon.js';
import { IconTerminal } from './icons/IconTerminal.js';

/** Todo lo que el panel inferior necesita saber de una de sus pestañas. */
export interface PanelViewDescriptor {
  readonly id: PanelView;
  readonly labelKey: TranslationKey;
  readonly Icon: (props: IconProps) => React.JSX.Element;
  readonly render: () => React.JSX.Element;
}

/**
 * Las pestañas del panel inferior, en orden.
 *
 * Mismo registro que el de las vistas laterales y por la misma razón: el panel
 * no conoce a sus inquilinos, los recorre. El panel de problemas entra acá como
 * una entrada más cuando el LSP empiece a producir diagnósticos.
 *
 * @example
 * for (const panel of PANEL_VIEW_REGISTRY) renderTab(panel);
 */
export const PANEL_VIEW_REGISTRY: readonly PanelViewDescriptor[] = [
  {
    id: 'terminal',
    labelKey: 'terminal.panel',
    Icon: IconTerminal,
    render: () => <TerminalPanel />,
  },
];
