import { rankByFuzzyMatch } from '@pastecode/core';
import { useMemo, useState } from 'react';

import { QuickPick } from '../../components/QuickPick.js';
import { t } from '../../i18n/index.js';
import { useCommandStore } from '../../stores/command-store.js';

import { commandTitle } from './command-title.js';

/**
 * La paleta de comandos (`Ctrl+Shift+P`).
 *
 * Es [RF-701](../../../../../../docs/03-requerimientos-funcionales.md#comandos-atajos-y-configuración):
 * búsqueda fuzzy de todos los comandos registrados. El matching es de
 * `packages/core` y la interacción es del `QuickPick`; acá queda sólo qué se
 * lista y qué pasa al elegir.
 */
export function CommandPalette(): React.JSX.Element | null {
  const isOpen = useCommandStore((state) => state.isPaletteOpen);
  const close = useCommandStore((state) => state.closePalette);
  const registry = useCommandStore((state) => state.registry);
  const revision = useCommandStore((state) => state.revision);
  const run = useCommandStore((state) => state.run);

  const [query, setQuery] = useState('');

  const matches = useMemo(
    // `revision` está en las dependencias porque el registro es mutable: su
    // identidad no cambia al registrar, así que sin esto la lista quedaría
    // congelada con los comandos que había en el primer render.
    () => rankByFuzzyMatch(query, registry.list(), commandTitle),
    [query, registry, revision]
  );

  return (
    <QuickPick
      isOpen={isOpen}
      items={matches}
      getKey={(command) => command.id}
      getLabel={commandTitle}
      query={query}
      onQueryChange={setQuery}
      onPick={(command) => {
        close();
        void run(command.id);
      }}
      onClose={close}
      placeholder={t('palette.placeholder')}
      label={t('palette.label')}
      emptyLabel={t('palette.empty')}
    />
  );
}
