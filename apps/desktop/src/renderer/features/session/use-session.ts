import type { PersistedTabState } from '@pastecode/core';
import { fromFileUri, toFileUri } from '@pastecode/core';
import { useEffect, useRef } from 'react';

import { useEditorStore } from '../../stores/editor-store.js';
import { useFileTreeStore } from '../../stores/file-tree-store.js';
import { useWorkspaceStore } from '../../stores/workspace-store.js';
import { rememberedPosition } from '../editor/model-registry.js';
import { getActiveEditor } from '../editor/monaco-instance.js';
import { clearRestorePositions, rememberRestorePosition } from '../editor/restore-position.js';

/** Dónde empieza todo cuando no hay nada guardado. */
const ORIGIN = { line: 1, column: 1, scrollTopLine: 1 };

/**
 * Restaura la sesión de un workspace y guarda los cambios.
 *
 * Es [RF-707](../../../../../docs/03-requerimientos-funcionales.md#comandos-atajos-y-configuración)
 * entero visto desde el renderer. El debounce de 2 segundos y la escritura
 * viven en el main; acá sólo se reporta el estado cada vez que cambia, que es
 * lo que el main necesita para decidir cuándo escribir.
 *
 * @example
 * useSession(); // una vez, en el cascarón de la app
 */
export function useSession(): void {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const tabs = useEditorStore((state) => state.tabs);
  const expandedPaths = useFileTreeStore((state) => state.expandedPaths);

  // Mientras se restaura no se reporta nada: las aperturas que hace la propia
  // restauración dispararían un guardado con la sesión a medio abrir, y si la
  // app se cerrara justo ahí quedaría escrito ese estado parcial.
  const isRestoring = useRef(false);

  useEffect(() => {
    if (workspace === null) {
      clearRestorePositions();
      return;
    }

    isRestoring.current = true;
    void restore().finally(() => {
      isRestoring.current = false;
    });
  }, [workspace]);

  useEffect(() => {
    if (workspace === null || isRestoring.current) return;

    void window.pastecode.invoke('session:save', {
      openTabs: tabs.tabs.map((tab, index) =>
        snapshot(tab.path, tab.isDirty, index === tabs.activeTabIndex)
      ),
      activeTabIndex: tabs.activeTabIndex,
      // Se guardan **relativas** a la raíz, como pide el modelo de datos: un
      // workspace movido de carpeta sigue reabriendo las mismas carpetas.
      expandedFolders: [...expandedPaths].map((path) => relativize(path, workspace.root)),
    });
  }, [workspace, tabs, expandedPaths]);
}

/** Trae la sesión guardada y reabre lo que sobrevivió. */
async function restore(): Promise<void> {
  clearRestorePositions();

  const result = await window.pastecode.invoke('session:load', {});
  if (!result.ok || result.value.state === null) return;

  const { state } = result.value;
  const editor = useEditorStore.getState();

  for (const tab of state.openTabs) {
    const path = fromFileUri(tab.uri);
    if (path === undefined) continue;

    rememberRestorePosition(path, {
      line: tab.cursorPosition.line,
      column: tab.cursorPosition.column,
      scrollTopLine: tab.scrollTopLine,
    });

    // Secuencial y no en paralelo: `openTab` de core arma el orden a partir
    // del estado anterior, así que abrir cuatro a la vez daría un orden que
    // depende de qué lectura del disco termine primero. Los archivos que ya
    // no existen fallan solos y no se abren, que es el descarte silencioso
    // que pide RF-707.
    await editor.open(path);
  }

  // El índice llega ya recalculado por el main, pero se resuelve por ruta y no
  // por número: entre el `session:load` y este punto puede haber fallado una
  // apertura, y en ese caso el número apuntaría a otra pestaña.
  const activeUri = state.openTabs[state.activeTabIndex]?.uri;
  const activePath = activeUri === undefined ? undefined : fromFileUri(activeUri);
  const index = useEditorStore.getState().tabs.tabs.findIndex((tab) => tab.path === activePath);

  if (index !== -1) useEditorStore.getState().activateTab(index);
}

/** El estado a persistir de una pestaña. */
function snapshot(path: string, isDirty: boolean, isActive: boolean): PersistedTabState {
  const position = isActive ? livePosition() : rememberedPosition(path);

  return {
    uri: toFileUri(path),
    cursorPosition: {
      line: position?.line ?? ORIGIN.line,
      column: position?.column ?? ORIGIN.column,
    },
    scrollTopLine: position?.scrollTopLine ?? ORIGIN.scrollTopLine,
    isDirty,
    // El anclado de pestañas no existe todavía; el campo está en el schema
    // porque el modelo de datos lo declara.
    isPinned: false,
  };
}

/** La posición de ahora de la pestaña activa, preguntándosela al editor. */
function livePosition(): { line: number; column: number; scrollTopLine: number } | undefined {
  const editor = getActiveEditor();
  const cursor = editor?.getPosition();

  if (editor === null || cursor === null || cursor === undefined) return undefined;

  return {
    line: cursor.lineNumber,
    column: cursor.column,
    // La línea visible más arriba. Se guarda la línea y no el píxel porque el
    // píxel depende del tamaño de fuente, que es un setting que puede cambiar
    // entre una sesión y la otra.
    scrollTopLine: editor.getVisibleRanges()[0]?.startLineNumber ?? ORIGIN.scrollTopLine,
  };
}

/** Una ruta absoluta, relativa a la raíz y con barras normales. */
function relativize(path: string, root: string): string {
  const normalizedPath = path.replaceAll('\\', '/');
  const normalizedRoot = root.replaceAll('\\', '/');

  return normalizedPath.startsWith(normalizedRoot)
    ? normalizedPath.slice(normalizedRoot.length).replace(/^\//, '')
    : normalizedPath;
}
