import { t } from '../../i18n/index.js';
import { useEditorStore } from '../../stores/editor-store.js';

import { Tab } from './Tab.js';

/**
 * La tira de pestañas.
 *
 * Es una `tablist` de verdad y no una fila de botones: los lectores de
 * pantalla anuncian la posición y el total, y las flechas se esperan como
 * navegación entre pestañas (RNF-23).
 */
export function TabStrip(): React.JSX.Element | null {
  const tabs = useEditorStore((state) => state.tabs.tabs);
  const activeIndex = useEditorStore((state) => state.tabs.activeTabIndex);
  const activateTab = useEditorStore((state) => state.activateTab);
  const closeTab = useEditorStore((state) => state.closeTab);

  if (tabs.length === 0) return null;

  return (
    <div role="tablist" aria-label={t('tabs.label')} className="tabs">
      {tabs.map((tab, index) => (
        <Tab
          key={tab.path}
          tab={tab}
          isActive={index === activeIndex}
          onActivate={() => {
            activateTab(index);
          }}
          onClose={() => {
            closeTab(index);
          }}
        />
      ))}
    </div>
  );
}
