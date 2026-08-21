import type { Command } from '@pastecode/core';
import { useEffect, useRef } from 'react';

import { commandTitle } from '../features/commands/command-title.js';
import { shortcutLabel } from '../features/commands/shortcut-label.js';
import { useCommandStore } from '../stores/command-store.js';
import { useKeybindingsStore } from '../stores/keybindings-store.js';

import type { MenuDescriptor, MenuItem } from './menu-registry.js';

/** Un ítem que sí se va a dibujar: su comando existe en el registro. */
type ResolvedItem = { separator: true } | { command: Command };

/**
 * El desplegable de un menú.
 *
 * **Los ítems se resuelven contra el registro de comandos**: el título sale de
 * `commandTitle` y el atajo de `shortcutLabel`, así que renombrar un comando o
 * cambiar un atajo en `keybindings.json` se refleja acá sin tocar nada.
 *
 * Un ítem cuyo comando no está registrado desaparece, y con él el separador
 * que queda huérfano. Es lo que hace que sacar una feature no deje entradas
 * muertas en un menú.
 *
 * **Es presentacional en lo que importa**: no decide si está abierto ni cuál
 * lo está — eso es de `MenuBar`, que es quien tiene el estado de la barra.
 */
export function Menu({
  menu,
  onClose,
}: {
  menu: MenuDescriptor;
  onClose: () => void;
}): React.JSX.Element {
  const registry = useCommandStore((state) => state.registry);
  const revision = useCommandStore((state) => state.revision);
  const run = useCommandStore((state) => state.run);
  const userBindings = useKeybindingsStore((state) => state.bindings);
  const listRef = useFocusFirstItem(revision);

  const items = resolveItems(menu.items, (id) => registry.get(id));

  return (
    <div
      ref={listRef}
      role="menu"
      aria-label={menu.id}
      className="menu-bar__dropdown"
      data-testid={`menu-${menu.id}`}
      onKeyDown={(event) => {
        moveWithArrows(event);
      }}
    >
      {items.map((item, index) =>
        'separator' in item ? (
          // Los separadores no son navegables: `role="separator"` los saca del
          // recorrido de un lector de pantalla, que es lo que corresponde.
          <hr key={`separator-${String(index)}`} role="separator" className="menu-bar__rule" />
        ) : (
          <button
            key={item.command.id}
            type="button"
            role="menuitem"
            className="menu-bar__item"
            data-testid={`menu-item-${item.command.id}`}
            onClick={() => {
              onClose();
              void run(item.command.id);
            }}
          >
            <span>{commandTitle(item.command)}</span>
            <span className="menu-bar__shortcut">
              {shortcutLabel(item.command.id, userBindings)}
            </span>
          </button>
        )
      )}
    </div>
  );
}

/**
 * Cambia los ids por los comandos que existen y limpia los separadores sueltos.
 *
 * Un separador al principio, al final o pegado a otro es lo que queda cuando
 * desaparece el ítem que separaba, y una línea sola en un menú se ve como un
 * error.
 */
function resolveItems(
  items: readonly MenuItem[],
  find: (id: string) => Command | undefined
): ResolvedItem[] {
  const resolved = items.flatMap<ResolvedItem>((item) => {
    if ('separator' in item) return [{ separator: true }];

    const command = find(item.commandId);

    return command === undefined ? [] : [{ command }];
  });

  return resolved.filter((item, index) => {
    if (!('separator' in item)) return true;

    const previous = resolved[index - 1];

    return (
      previous !== undefined && !('separator' in previous) && index !== resolved.length - 1
    );
  });
}

/** Enfoca el primer ítem al abrir, que es lo que espera el patrón de menú. */
function useFocusFirstItem(revision: number): React.RefObject<HTMLDivElement | null> {
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listRef.current?.querySelector('button')?.focus();
  }, [revision]);

  return listRef;
}

/**
 * Recorre los ítems con las flechas, dando la vuelta en los extremos.
 *
 * Dar la vuelta no es un detalle: es lo que dice el patrón de menú de WAI-ARIA
 * y es lo que hace que bajar desde el último llegue al primero en vez de no
 * hacer nada (RNF-23).
 */
function moveWithArrows(event: React.KeyboardEvent<HTMLDivElement>): void {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

  event.preventDefault();

  const buttons = [...event.currentTarget.querySelectorAll('button')];
  const focused = document.activeElement;
  const current = focused instanceof HTMLButtonElement ? buttons.indexOf(focused) : -1;
  const step = event.key === 'ArrowDown' ? 1 : -1;
  const next = buttons[(current + step + buttons.length) % buttons.length];

  next?.focus();
}
