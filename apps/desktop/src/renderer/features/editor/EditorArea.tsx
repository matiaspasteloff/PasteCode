import type { EditorGroup } from '@pastecode/core';
import { activeTab } from '@pastecode/core';

import { t } from '../../i18n/index.js';
import { useEditorStore } from '../../stores/editor-store.js';

import { MonacoEditor } from './MonacoEditor.js';
import { TabStrip } from './TabStrip.js';

/**
 * El área de edición: uno o dos grupos, cada uno con su tira de pestañas.
 *
 * La tira de pestañas bajó acá adentro al llegar el split: con dos paneles,
 * cada uno tiene las suyas, y una tira arriba de todo no sabría cuáles mostrar.
 *
 * Los cuatro estados —carga, error, vacío y contenido— siguen juntos y siguen
 * siendo obligatorios por el
 * [DoD](../../../../../../docs/convenciones/definition-of-done.md).
 */
export function EditorArea(): React.JSX.Element {
  const groups = useEditorStore((state) => state.groups);

  return (
    <div
      className={`editor-groups editor-groups--${groups.layout}`}
      data-testid="editor-groups"
    >
      {groups.groups.map((group) => (
        <EditorGroupPane
          key={group.id}
          group={group}
          isFocused={group.id === groups.activeGroupId}
        />
      ))}
    </div>
  );
}

/** Un grupo: su tira de pestañas y su instancia de editor. */
function EditorGroupPane({
  group,
  isFocused,
}: {
  group: EditorGroup;
  isFocused: boolean;
}): React.JSX.Element {
  const isLoading = useEditorStore((state) => state.isLoading);
  const error = useEditorStore((state) => state.error);
  const focusGroup = useEditorStore((state) => state.focusGroup);
  const active = activeTab(group.tabs);

  return (
    <section
      className="editor-group"
      data-focused={isFocused}
      data-testid={`editor-group-${group.id}`}
      // Un click en cualquier parte del panel le da el foco, no sólo uno
      // adentro del texto: la tira de pestañas y el fondo también son "acá".
      onFocus={() => {
        focusGroup(group.id);
      }}
      onClick={() => {
        focusGroup(group.id);
      }}
    >
      <TabStrip group={group} />
      {paneBody(group, active?.path ?? null, isLoading, error?.userMessage ?? null)}
    </section>
  );
}

/** El cuerpo del panel: editor, carga, error o vacío. En ese orden. */
function paneBody(
  group: EditorGroup,
  activePath: string | null,
  isLoading: boolean,
  errorMessage: string | null
): React.JSX.Element {
  // El editor va primero: mientras haya una pestaña abierta, lo que pase con
  // una carga posterior no tiene que sacarla de la pantalla.
  if (activePath !== null) return <MonacoEditor activePath={activePath} groupId={group.id} />;

  // Sin este estado, abrir un archivo grande deja la pantalla diciendo "abrí
  // una carpeta" mientras se lee, y parece que el click no hizo nada.
  if (isLoading) {
    return (
      <p className="editor-area__empty" data-testid="editor-loading">
        {t('editor.openingFile')}
      </p>
    );
  }

  if (errorMessage !== null) {
    // `userMessage` y nunca `message`: RNF-25.
    return (
      <p className="editor-area__empty" role="alert" data-testid="editor-error">
        {errorMessage}
      </p>
    );
  }

  return <p className="editor-area__empty">{t('workspace.emptyDescription')}</p>;
}
