import { t } from '../../i18n/index.js';

import { CommandList, paletteOptionId } from './CommandList.js';
import { usePalette } from './use-palette.js';

/**
 * La paleta de comandos (`Ctrl+Shift+P`).
 *
 * Es [RF-701](../../../../../../docs/03-requerimientos-funcionales.md):
 * búsqueda fuzzy de todos los comandos registrados. El matching es de
 * `packages/core`, el estado es de `usePalette` y el teclado es de
 * `resolvePaletteKey`; acá queda el marcado.
 *
 * El patrón ARIA es `combobox` + `listbox`: el foco se queda en el input
 * mientras las flechas mueven la selección, y `aria-activedescendant` le dice
 * al lector de pantalla cuál está elegida sin mover el foco real (RNF-23).
 */
export function CommandPalette(): React.JSX.Element | null {
  const palette = usePalette();

  if (!palette.isOpen) return null;

  return (
    <div className="palette" role="presentation" onClick={palette.close}>
      {/* El click de adentro no tiene que cerrar la paleta. */}
      <div
        className="palette__panel"
        role="presentation"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <input
          ref={palette.inputRef}
          type="text"
          role="combobox"
          aria-expanded
          aria-controls="palette-list"
          aria-activedescendant={paletteOptionId(palette.matches[palette.highlighted])}
          aria-label={t('palette.label')}
          className="palette__input"
          placeholder={t('palette.placeholder')}
          value={palette.query}
          onChange={(event) => {
            palette.setQuery(event.target.value);
            palette.setHighlighted(0);
          }}
          onKeyDown={palette.handleKeyDown}
        />

        <CommandList
          commands={palette.matches}
          highlighted={palette.highlighted}
          onHighlight={palette.setHighlighted}
          onRun={palette.execute}
        />
      </div>
    </div>
  );
}
