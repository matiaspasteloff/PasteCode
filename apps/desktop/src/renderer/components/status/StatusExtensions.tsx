import { useCommandStore } from '../../stores/command-store.js';
import { useExtensionsStore } from '../../stores/extensions-store.js';

/**
 * Los ítems que aportan las extensiones ([RF-904](../../../../../docs/03-requerimientos-funcionales.md)).
 *
 * Es **un componente más de la lista de la barra**, suscripto a su propio
 * store, igual que la rama de Git o la posición del cursor. Esa es toda la
 * integración que hacía falta: la `StatusBar` es un contenedor desde el paso
 * 26½, así que una contribución de extensión no es un caso especial.
 *
 * Un ítem con `command` se dibuja como botón y no como texto: si hacer clic
 * hace algo, tiene que ser alcanzable con el teclado y anunciarse como
 * accionable ([RNF-23](../../../../../docs/04-requerimientos-no-funcionales.md)).
 * Sin comando es un `span`, porque un botón que no hace nada es peor que un
 * texto.
 */
export function StatusExtensions(): React.JSX.Element | null {
  const items = useExtensionsStore((state) => state.statusItems);
  const run = useCommandStore((state) => state.run);

  if (items.length === 0) return null;

  return (
    <>
      {items.map((item) =>
        item.command === undefined ? (
          <span
            key={item.itemId}
            className="status-bar__item"
            title={item.tooltip}
            data-testid={`status-extension-${item.extension}`}
          >
            {item.text}
          </span>
        ) : (
          <button
            key={item.itemId}
            type="button"
            className="status-bar__item status-bar__item--action"
            title={item.tooltip}
            data-testid={`status-extension-${item.extension}`}
            onClick={() => {
              void run(`ext:${item.command ?? ''}`);
            }}
          >
            {item.text}
          </button>
        )
      )}
    </>
  );
}
