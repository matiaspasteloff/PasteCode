import { useEffect } from 'react';

import { useEditorStore } from '../../stores/editor-store.js';

/**
 * Conecta `Ctrl+S` con el guardado.
 *
 * Un único listener a nivel documento, y no un `addCommand` de Monaco: guardar
 * tiene que andar aunque el foco esté en el árbol de archivos. Monaco no
 * reserva `Ctrl+S`, así que el evento llega hasta acá también cuando el editor
 * tiene el foco.
 *
 * Es provisorio por diseño. El paso 18 trae el resolver de keybindings con
 * cláusulas `when`, y entonces esto pasa a ser un binding más de una tabla en
 * vez de un listener escrito a mano.
 *
 * @example
 * useSaveShortcut(); // una vez, en el cascarón de la app
 */
export function useSaveShortcut(): void {
  const save = useEditorStore((state) => state.save);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      // `event.key` y no `event.code`: en un teclado no QWERTY la tecla física
      // `KeyS` puede no ser la "s", y lo que la persona pulsa es la letra.
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return;

      // El navegador abriría el diálogo de "guardar página".
      event.preventDefault();
      void save();
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [save]);
}
