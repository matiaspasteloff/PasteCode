import { t } from '../i18n/index.js';
import { useViewStore } from '../stores/view-store.js';

import { AUX_VIEW_REGISTRY } from './view-registry.js';

/**
 * El contenedor de la columna auxiliar, a la derecha del área de edición.
 *
 * Es el clon estructural de [`SideView`](./SideView.tsx) sobre el otro eje, y
 * eso es deliberado: los dos resuelven un descriptor por id y dibujan lo que
 * diga, sin conocer ninguna vista. Lo único que no comparten es el
 * `WorkspaceHeader` —el nombre de la carpeta ya está a la izquierda y
 * repetirlo sería ruido— y el vacío de "abrí una carpeta": el asistente
 * responde igual sin workspace, sólo que sin herramientas para explorarlo.
 *
 * Devuelve `null` con la columna colapsada para que la pista `auto` de la
 * grilla mida cero. Es la misma forma que arregló el hueco a la derecha al
 * colapsar el explorador, y por la misma razón.
 *
 * @returns El panel, o `null` si no hay ninguna vista auxiliar visible.
 * @example
 * <AuxView />
 */
export function AuxView(): React.JSX.Element | null {
  const auxView = useViewStore((state) => state.auxView);

  if (auxView === null) return null;

  const descriptor = AUX_VIEW_REGISTRY.find((view) => view.id === auxView);

  if (descriptor === undefined) return null;

  return (
    <aside className="aux-view" aria-label={t(descriptor.labelKey)} data-testid="aux-view">
      <header className="aux-view__title">{t(descriptor.labelKey)}</header>

      {descriptor.render()}
    </aside>
  );
}
