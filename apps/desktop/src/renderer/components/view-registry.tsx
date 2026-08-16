import { activeTab } from '@pastecode/core';

import { FileTree } from '../features/file-tree/FileTree.js';
import { SearchPanel } from '../features/search/SearchPanel.js';
import type { TranslationKey } from '../i18n/index.js';
import { useEditorStore } from '../stores/editor-store.js';
import type { SideView } from '../stores/view-store.js';

import type { IconProps } from './icons/Icon.js';
import { IconExplorer } from './icons/IconExplorer.js';
import { IconSearch } from './icons/IconSearch.js';

/** Todo lo que el cascarón necesita saber de una vista lateral. */
export interface SideViewDescriptor {
  readonly id: SideView;
  /** Cómo se llama, para el `aria-label` del rail y el título del panel. */
  readonly labelKey: TranslationKey;
  /** Qué comando la muestra. El rail no llama acciones, dispara comandos. */
  readonly commandId: string;
  readonly Icon: (props: IconProps) => React.JSX.Element;
  readonly render: () => React.JSX.Element;
}

/**
 * El explorador de archivos.
 *
 * Está acá y no inline en el registro porque necesita dos cosas del store del
 * editor —cuál es el archivo activo y cómo abrir otro— y un `render` no puede
 * usar hooks. Es un componente de verdad, así que se declara como uno.
 */
function ExplorerView(): React.JSX.Element {
  const activePath = useEditorStore((state) => activeTab(state.tabs)?.path ?? null);
  const openFile = useEditorStore((state) => state.open);

  return (
    <FileTree
      selectedPath={activePath}
      onSelectFile={(path) => {
        void openFile(path);
      }}
    />
  );
}

/**
 * Las vistas de la barra lateral, en el orden en que aparecen en el rail.
 *
 * **Agregar una vista es agregar una entrada acá.** Ése es el punto del
 * registro: antes, la barra lateral tenía escrito `isSearchOpen ? <SearchPanel/>
 * : <FileTree/>`, así que una tercera vista obligaba a tocar el contenedor, el
 * store de la feature que le prestaba el booleano y el rail. Ahora el rail se
 * dibuja recorriendo esta lista y el contenedor busca por id.
 *
 * El panel de Git entra acá cuando exista, y esa entrada es la única prueba
 * que este diseño necesita.
 *
 * @example
 * for (const view of SIDE_VIEW_REGISTRY) renderButton(view);
 */
export const SIDE_VIEW_REGISTRY: readonly SideViewDescriptor[] = [
  {
    id: 'explorer',
    labelKey: 'view.explorer',
    commandId: 'view.showExplorer',
    Icon: IconExplorer,
    render: () => <ExplorerView />,
  },
  {
    id: 'search',
    labelKey: 'view.search',
    commandId: 'search.toggle',
    Icon: IconSearch,
    render: () => <SearchPanel />,
  },
];
