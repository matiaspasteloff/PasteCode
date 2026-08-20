import type { GroupsState, PersistedGroup, PersistedTabState } from '@pastecode/core';
import { activeGroup, fromFileUri, PRIMARY_GROUP_ID, toFileUri } from '@pastecode/core';
import { useEffect, useRef } from 'react';

import { useDebugStore } from '../../stores/debug-store.js';
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
  const groups = useEditorStore((state) => state.groups);
  const expandedPaths = useFileTreeStore((state) => state.expandedPaths);
  const breakpoints = useDebugStore((state) => state.breakpoints);

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

    const primary = groups.groups[0]?.tabs ?? { tabs: [], activeTabIndex: -1 };

    void window.pastecode.invoke('session:save', {
      // **Las dos formas.** `openTabs` espeja el grupo primario para que un
      // build anterior al split restaure algo sensato en vez de una ventana
      // vacía; `groups` es lo que lee esta versión. Ver ADR-0023.
      openTabs: primary.tabs.map((tab, index) =>
        snapshot(tab.path, tab.isDirty, index === primary.activeTabIndex)
      ),
      activeTabIndex: primary.activeTabIndex,
      groups: persistGroups(groups),
      layout: groups.layout,
      activeGroupId: groups.activeGroupId,
      // Se guardan **relativas** a la raíz, como pide el modelo de datos: un
      // workspace movido de carpeta sigue reabriendo las mismas carpetas.
      expandedFolders: [...expandedPaths].map((path) => relativize(path, workspace.root)),
      // Absolutos y no relativos, a diferencia de las carpetas: un breakpoint
      // puede estar en un archivo de afuera del workspace —una dependencia que
      // se abrió para mirar—, y relativizarlo lo dejaría apuntando a la nada.
      breakpoints,
    });
  }, [workspace, groups, expandedPaths, breakpoints]);
}

/** Los grupos, en la forma que se persiste. */
function persistGroups(groups: GroupsState): PersistedGroup[] {
  const focusedPath =
    activeGroup(groups).tabs.tabs[activeGroup(groups).tabs.activeTabIndex]?.path;

  return groups.groups.map((group) => ({
    id: group.id,
    openTabs: group.tabs.tabs.map((tab, index) =>
      snapshot(
        tab.path,
        tab.isDirty,
        index === group.tabs.activeTabIndex && tab.path === focusedPath
      )
    ),
    activeTabIndex: group.tabs.activeTabIndex,
  }));
}

/** Trae la sesión guardada y reabre lo que sobrevivió. */
async function restore(): Promise<void> {
  clearRestorePositions();

  const result = await window.pastecode.invoke('session:load', {});

  if (!result.ok || result.value.state === null) return;

  const { state } = result.value;
  // Ausencia de `groups` es una sesión escrita antes del split: un solo grupo
  // armado desde `openTabs`. Ésa es toda la migración.
  const persisted =
    state.groups ??
    ([
      { id: PRIMARY_GROUP_ID, openTabs: state.openTabs, activeTabIndex: state.activeTabIndex },
    ] as const);

  for (const group of persisted) {
    await restoreGroup(group);
  }

  applyLayout(state.layout, state.activeGroupId);
  useDebugStore.getState().setBreakpoints(state.breakpoints ?? []);
}

/** Reabre las pestañas de un grupo, en orden y adentro de ese grupo. */
async function restoreGroup(group: PersistedGroup): Promise<void> {
  const editor = useEditorStore.getState();

  // El grupo secundario se crea partiendo la pantalla; el primario ya existe.
  if (group.id !== PRIMARY_GROUP_ID && editor.groups.groups.length === 1) {
    editor.splitEditor('horizontal');
  }

  useEditorStore.getState().focusGroup(group.id);

  for (const tab of group.openTabs) {
    const path = fromFileUri(tab.uri);

    if (path === undefined) continue;

    rememberRestorePosition(path, {
      line: tab.cursorPosition.line,
      column: tab.cursorPosition.column,
      scrollTopLine: tab.scrollTopLine,
    });

    // Secuencial y no en paralelo: `openTab` de core arma el orden a partir
    // del estado anterior, así que abrir cuatro a la vez daría un orden que
    // depende de qué lectura del disco termine primero.
    await useEditorStore.getState().open(path);
  }

  const activeUri = group.openTabs[group.activeTabIndex]?.uri;
  const activePath = activeUri === undefined ? undefined : fromFileUri(activeUri);
  const restored = useEditorStore
    .getState()
    .groups.groups.find((candidate) => candidate.id === group.id);
  const index = restored?.tabs.tabs.findIndex((tab) => tab.path === activePath) ?? -1;

  // Se resuelve por ruta y no por número: entre el `session:load` y este punto
  // puede haber fallado una apertura, y ahí el número apuntaría a otra pestaña.
  if (index !== -1) useEditorStore.getState().activateTab(group.id, index);
}

/** Deja la orientación y el foco que tenía la sesión. */
function applyLayout(layout: GroupsState['layout'] | undefined, activeGroupId?: string): void {
  const editor = useEditorStore.getState();

  if (layout !== undefined && layout !== 'single' && editor.groups.groups.length > 1) {
    useEditorStore.setState({ groups: { ...editor.groups, layout } });
  }

  if (activeGroupId !== undefined) useEditorStore.getState().focusGroup(activeGroupId);
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
