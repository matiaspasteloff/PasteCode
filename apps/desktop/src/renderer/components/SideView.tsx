import { WorkspaceHeader } from '../features/workspace/WorkspaceHeader.js';
import { t } from '../i18n/index.js';
import { useViewStore } from '../stores/view-store.js';
import { useWorkspaceStore } from '../stores/workspace-store.js';

import { SIDE_VIEW_REGISTRY } from './view-registry.js';

/**
 * El contenedor de la barra lateral: encabezado del workspace y la vista activa.
 *
 * Reemplaza a `Sidebar.tsx`, que tenía el ruteo escrito a mano
 * (`isSearchOpen ? <SearchPanel/> : <FileTree/>`) y leía el booleano del store
 * de la búsqueda. Acá el contenedor no conoce ninguna vista: busca el
 * descriptor por id en el registro y dibuja lo que diga.
 *
 * El componente cambia de nombre pero **el bloque de CSS sigue llamándose
 * `sidebar`**: sigue siendo la barra lateral, y renombrar la clase sólo
 * rompería el spec de tema que mide su fondo. La red de los E2E existentes es
 * lo único que cubre un cambio que toca todos los componentes a la vez.
 *
 * **Alterna en vez de partirse.** Con los 16rem de `--sidebar-width`, mostrar
 * dos vistas a la vez deja a las dos inservibles, y es el mismo criterio que
 * usa cualquier editor con barra de actividades.
 */
export function SideView(): React.JSX.Element | null {
  const sideView = useViewStore((state) => state.sideView);
  const workspace = useWorkspaceStore((state) => state.workspace);

  if (sideView === null) return null;

  const descriptor = SIDE_VIEW_REGISTRY.find((view) => view.id === sideView);

  if (descriptor === undefined) return null;

  return (
    <aside className="sidebar" aria-label={t(descriptor.labelKey)}>
      <WorkspaceHeader />

      <header className="sidebar__title">{t(descriptor.labelKey)}</header>

      {/* Sin carpeta abierta no hay nada que listar ni dónde buscar. */}
      {workspace === null ? (
        <p className="sidebar__empty">{t('workspace.emptyDescription')}</p>
      ) : (
        descriptor.render()
      )}
    </aside>
  );
}
