import type { EditorGroup } from '@pastecode/core';

import { IconSplit } from '../../components/icons/IconSplit.js';
import { t } from '../../i18n/index.js';
import { useEditorStore } from '../../stores/editor-store.js';

import { Tab } from './Tab.js';

/**
 * La tira de pestañas de **un** grupo.
 *
 * Recibe el grupo por prop en vez de leer el store: con dos paneles hay dos
 * tiras, y cada una tiene que dibujar las suyas. Lo que sí lee del store son
 * las acciones, que son estables.
 *
 * Es una `tablist` de verdad y no una fila de botones: los lectores de
 * pantalla anuncian la posición y el total, y las flechas se esperan como
 * navegación entre pestañas (RNF-23).
 */
export function TabStrip({ group }: { group: EditorGroup }): React.JSX.Element | null {
  const activateTab = useEditorStore((state) => state.activateTab);
  const closeTab = useEditorStore((state) => state.closeTab);
  const splitEditor = useEditorStore((state) => state.splitEditor);

  const { tabs, activeTabIndex } = group.tabs;

  if (tabs.length === 0) return null;

  return (
    <div role="tablist" aria-label={t('tabs.label')} className="tabs">
      {tabs.map((tab, index) => (
        <Tab
          key={tab.path}
          tab={tab}
          isActive={index === activeTabIndex}
          onActivate={() => {
            activateTab(group.id, index);
          }}
          onClose={() => {
            closeTab(group.id, index);
          }}
        />
      ))}

      {/* A la derecha de las pestañas, que es donde la vista lo busca. Es un
          botón y no sólo un atajo porque RNF-23 pide que todo lo que se puede
          hacer con el teclado se pueda hacer con el mouse. */}
      <button
        type="button"
        className="tabs__split"
        aria-label={t('command.editorSplitRight')}
        title={t('command.editorSplitRight')}
        data-testid="tabs-split"
        onClick={() => {
          splitEditor('horizontal');
        }}
      >
        <IconSplit size={14} />
      </button>
    </div>
  );
}
