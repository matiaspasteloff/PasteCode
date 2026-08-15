import { t } from '../../i18n/index.js';
import { useEditorStore } from '../../stores/editor-store.js';

import { MonacoEditor } from './MonacoEditor.js';

/**
 * El panel de edición y sus cuatro estados.
 *
 * Los cuatro son obligatorios por el [DoD](../../../../../../docs/convenciones/definition-of-done.md):
 * carga, error, vacío y contenido. Están juntos acá y no repartidos en `App`
 * porque son excluyentes entre sí, y verlos en una sola función es lo que
 * hace evidente que no quedó ninguno afuera.
 */
export function EditorArea(): React.JSX.Element {
  const file = useEditorStore((state) => state.file);
  const isLoading = useEditorStore((state) => state.isLoading);
  const error = useEditorStore((state) => state.error);

  // El editor va primero: mientras haya un archivo abierto, lo que pase con
  // una carga posterior no tiene que sacarlo de la pantalla.
  if (file !== null) return <MonacoEditor key={file.path} file={file} />;

  // Sin este estado, abrir un archivo grande deja la pantalla diciendo "abrí
  // una carpeta" mientras se lee, y parece que el click no hizo nada.
  if (isLoading) {
    return (
      <p className="editor-area__empty" data-testid="editor-loading">
        {t('editor.openingFile')}
      </p>
    );
  }

  if (error !== null) {
    // `userMessage` y nunca `message`: RNF-25.
    return (
      <p className="editor-area__empty" role="alert" data-testid="editor-error">
        {error.userMessage}
      </p>
    );
  }

  return <p className="editor-area__empty">{t('workspace.emptyDescription')}</p>;
}
