import { useEffect, useRef, useState } from 'react';

import { resolvePaletteKey } from '../features/commands/palette-keyboard.js';

/** Lo que el `QuickPick` necesita para responder al teclado y al foco. */
interface QuickPickKeyboard {
  highlighted: number;
  setHighlighted: (index: number) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  handleKeyDown: (event: React.KeyboardEvent) => void;
}

/**
 * El foco y el teclado de un `QuickPick`.
 *
 * La decisión de qué hace cada tecla no está acá sino en `resolvePaletteKey`,
 * que es puro y está testeado: acá queda sólo el estado y el cableado con
 * React. Es la misma división que ya usan los keybindings de la aplicación.
 *
 * @param itemCount Cuántos candidatos hay. Acota el movimiento de las flechas.
 * @param isOpen Si el selector está abierto. Al abrirse, reinicia y enfoca.
 * @param onClose Qué hacer con Escape.
 * @param onRun Qué hacer con Enter, con el índice elegido.
 * @returns El estado del resaltado, el ref del input y el manejador.
 * @example
 * const keyboard = useQuickPickKeyboard(items.length, isOpen, onClose, pick);
 */
export function useQuickPickKeyboard(
  itemCount: number,
  isOpen: boolean,
  onClose: () => void,
  onRun: (index: number) => void
): QuickPickKeyboard {
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Cada apertura arranca con el foco puesto y en la primera opción.
    setHighlighted(0);
    inputRef.current?.focus();
  }, [isOpen]);

  const handleKeyDown = (event: React.KeyboardEvent): void => {
    const outcome = resolvePaletteKey(event.key, highlighted, itemCount);
    if (outcome === 'ignore') return;

    event.preventDefault();

    if (outcome === 'close') onClose();
    else if (outcome === 'run') onRun(highlighted);
    else setHighlighted(outcome);
  };

  return { highlighted, setHighlighted, inputRef, handleKeyDown };
}
