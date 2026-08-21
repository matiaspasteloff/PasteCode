/** El botón del medio, tal como lo numera el DOM. */
const MIDDLE_BUTTON = 1;

/**
 * Los dos handlers que hacen que la ruedita cierre una pestaña.
 *
 * **Hacen falta los dos y ninguno alcanza solo.** `onAuxClick` es el evento que
 * dispara el botón del medio —`onClick` sólo escucha al principal—, y el
 * `onMouseDown` con `preventDefault` es lo que evita que Windows abra el cursor
 * de autoscroll: sin él, cerrar una pestaña deja el círculo de desplazamiento
 * pegado al puntero hasta el siguiente click.
 *
 * Vive en su propio archivo porque lo usan tres tiras de pestañas distintas
 * —las del editor, las de las terminales y las del panel inferior— y la parte
 * que se olvida es siempre la misma: el `preventDefault`.
 *
 * @param onClose Qué cerrar.
 * @returns Las props para esparcir sobre el elemento de la pestaña.
 * @example
 * <div {...middleClickToClose(() => closeTab(index))} />
 */
export function middleClickToClose(onClose: () => void): {
  onAuxClick: (event: React.MouseEvent) => void;
  onMouseDown: (event: React.MouseEvent) => void;
} {
  return {
    onAuxClick: (event) => {
      if (event.button !== MIDDLE_BUTTON) return;

      event.preventDefault();
      event.stopPropagation();
      onClose();
    },

    onMouseDown: (event) => {
      // Sólo el del medio: cancelar el `mousedown` del principal rompería el
      // foco y la selección de texto de la pestaña.
      if (event.button === MIDDLE_BUTTON) event.preventDefault();
    },
  };
}
