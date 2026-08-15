import { useEffect, useState } from 'react';

/**
 * Ventana de la Etapa 1: el nombre y la versión, nada más.
 *
 * La versión no está hardcodeada. Llega por el canal `app:getVersion`, así que
 * verla en pantalla es la prueba visible de que la cadena contrato → main →
 * preload → renderer funciona de punta a punta.
 */
export function App(): React.JSX.Element {
  const [version, setVersion] = useState<string | undefined>(undefined);
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    // useEffect es correcto acá: es una llamada IPC asíncrona, no estado
    // derivado. Lo que codigo.md prohíbe es lo segundo.
    window.pastecode
      .invoke('app:getVersion', {})
      .then((result) => {
        if (result.ok) setVersion(result.value.version);
        else setHasFailed(true);
      })
      .catch(() => {
        // Un rechazo de la promesa ya no es "el handler falló" —eso viaja como
        // `ok: false`—, sino que el IPC mismo se rompió. Ver ADR-0011.
        setHasFailed(true);
      });
  }, []);

  return (
    <main className="app">
      <h1 className="app__name">PasteCode</h1>
      <p className="app__version" data-testid="app-version">
        {hasFailed ? '—' : (version ?? '…')}
      </p>
    </main>
  );
}
