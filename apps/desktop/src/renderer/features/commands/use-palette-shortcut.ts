import { useEffect } from 'react';

import { useCommandStore } from '../../stores/command-store.js';

/**
 * Conecta `Ctrl+Shift+P` con la paleta de comandos.
 *
 * Es provisorio por diseño, igual que el de guardar: el paso 18 trae el
 * resolver de keybindings con cláusulas `when`, y entonces esto pasa a ser un
 * binding más de una tabla en vez de un listener escrito a mano.
 *
 * @example
 * usePaletteShortcut(); // una vez, en el cascarón de la app
 */
export function usePaletteShortcut(): void {
  const openPalette = useCommandStore((state) => state.openPalette);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!event.ctrlKey || !event.shiftKey) return;
      // `event.key` con Shift llega en mayúscula; se compara plegado.
      if (event.key.toLowerCase() !== 'p') return;

      event.preventDefault();
      openPalette();
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openPalette]);
}
