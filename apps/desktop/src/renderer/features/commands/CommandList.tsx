import type { Command } from '@pastecode/core';

import { isTranslationKey, t } from '../../i18n/index.js';

interface CommandListProps {
  commands: readonly Command[];
  highlighted: number;
  onHighlight: (index: number) => void;
  onRun: (command: Command) => void;
}

/**
 * El identificador DOM de una opción, para `aria-activedescendant`.
 *
 * Vive acá y lo importa la paleta porque los dos lados tienen que coincidir:
 * si se calculara en cada lado por separado, un cambio de formato en uno
 * rompería el vínculo sin que nada falle a la vista.
 *
 * @param command El comando de la opción.
 * @returns El `id` del `<li>`.
 * @example
 * <input aria-activedescendant={paletteOptionId(matches[0])} />
 */
export function paletteOptionId(command: Command | undefined): string | undefined {
  return command === undefined ? undefined : `palette-option-${command.id}`;
}

/**
 * La lista de resultados de la paleta.
 *
 * **Es presentacional**: recibe los comandos ya filtrados y ordenados. El
 * matching fuzzy es de `packages/core` y el estado es del store.
 */
export function CommandList({
  commands,
  highlighted,
  onHighlight,
  onRun,
}: CommandListProps): React.JSX.Element {
  return (
    <ul
      id="palette-list"
      role="listbox"
      aria-label={t('palette.label')}
      className="palette__list"
    >
      {commands.length === 0 && <li className="palette__empty">{t('palette.empty')}</li>}

      {commands.map((command, index) => (
        <li
          key={command.id}
          id={paletteOptionId(command)}
          role="option"
          aria-selected={index === highlighted}
          className="palette__item"
          data-highlighted={index === highlighted}
          onMouseEnter={() => {
            onHighlight(index);
          }}
          onClick={() => {
            onRun(command);
          }}
        >
          {commandTitle(command)}
        </li>
      ))}
    </ul>
  );
}

/**
 * El título traducido, o la clave misma si no está en el diccionario.
 *
 * El caso del `else` no es teórico: desde la Etapa 5 los comandos pueden venir
 * de extensiones, con títulos que nuestro diccionario no conoce. Mostrar la
 * clave cruda es feo, pero es mejor que no mostrar nada.
 *
 * @param command El comando.
 * @returns El texto a mostrar.
 * @example
 * commandTitle({ id: 'file.save', title: 'command.fileSave', handler });
 */
export function commandTitle(command: Command): string {
  return isTranslationKey(command.title) ? t(command.title) : command.title;
}
