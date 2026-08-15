import { rankByFuzzyMatch, type Command } from '@pastecode/core';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useCommandStore } from '../../stores/command-store.js';

import { commandTitle } from './CommandList.js';
import { resolvePaletteKey } from './palette-keyboard.js';

/** Todo lo que la paleta necesita para pintarse y responder. */
interface PaletteController {
  isOpen: boolean;
  query: string;
  setQuery: (query: string) => void;
  highlighted: number;
  setHighlighted: (index: number) => void;
  matches: readonly Command[];
  inputRef: React.RefObject<HTMLInputElement | null>;
  close: () => void;
  execute: (command: Command | undefined) => void;
  handleKeyDown: (event: React.KeyboardEvent) => void;
}

/**
 * El estado de la paleta de comandos.
 *
 * Está separado del componente para que `CommandPalette` quede sólo con el
 * JSX: entre el filtrado, el resaltado, el foco y el teclado, el componente se
 * pasaba del límite de 50 líneas de RNF-20, y ese límite existe justo para
 * forzar este corte.
 *
 * @returns El controlador de la paleta.
 * @example
 * const palette = usePalette();
 */
export function usePalette(): PaletteController {
  const isOpen = useCommandStore((state) => state.isPaletteOpen);
  const close = useCommandStore((state) => state.closePalette);
  const registry = useCommandStore((state) => state.registry);
  const revision = useCommandStore((state) => state.revision);
  const run = useCommandStore((state) => state.run);

  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(
    // `revision` está en las dependencias porque el registro es mutable: su
    // identidad no cambia al registrar, así que sin esto la lista quedaría
    // congelada con los comandos que había en el primer render.
    () => rankByFuzzyMatch(query, registry.list(), commandTitle),
    [query, registry, revision]
  );

  useEffect(() => {
    if (!isOpen) return;

    // Cada apertura arranca limpia: reabrir con lo tipeado la vez anterior
    // obliga a borrarlo antes de buscar otra cosa.
    setQuery('');
    setHighlighted(0);
    inputRef.current?.focus();
  }, [isOpen]);

  const execute = (command: Command | undefined): void => {
    if (command === undefined) return;

    close();
    void run(command.id);
  };

  const handleKeyDown = (event: React.KeyboardEvent): void => {
    const outcome = resolvePaletteKey(event.key, highlighted, matches.length);
    if (outcome === 'ignore') return;

    event.preventDefault();
    if (outcome === 'close') close();
    else if (outcome === 'run') execute(matches[highlighted]);
    else setHighlighted(outcome);
  };

  return {
    isOpen,
    query,
    setQuery,
    highlighted,
    setHighlighted,
    matches,
    inputRef,
    close,
    execute,
    handleKeyDown,
  };
}
