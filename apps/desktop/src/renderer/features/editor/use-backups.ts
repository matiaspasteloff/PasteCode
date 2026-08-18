import { allOpenPaths } from '@pastecode/core';
import { useEffect } from 'react';

import { useEditorStore } from '../../stores/editor-store.js';
import { useRecoveryStore } from '../../stores/recovery-store.js';

import { contentOf } from './model-registry.js';

/**
 * Cada cuánto se respalda lo que no está guardado.
 *
 * Los 30 segundos los fija [RNF-08](../../../../../docs/04-requerimientos-no-funcionales.md#confiabilidad)
 * y no son negociables acá. Es la ventana de trabajo que alguien puede perder
 * en el peor caso.
 */
const BACKUP_INTERVAL_MS = 30_000;

/**
 * Respalda las pestañas sucias y ofrece recuperar lo que quedó de un cierre
 * anterior (RNF-08).
 *
 * **Sólo respalda lo que está sucio.** Una pestaña limpia es idéntica al disco,
 * y respaldarla sería escribir una copia de algo que ya está guardado, treinta
 * veces por minuto de sesión.
 *
 * El contenido sale del registro de modelos y no del store: el store no guarda
 * el texto a propósito —dos copias del archivo son dos formas de que se
 * desincronicen— y `readContent` sólo alcanza a la pestaña que está en el
 * editor, no a las otras que también pueden estar sucias.
 *
 * @example
 * useBackups(); // una vez, en el cascarón de la app
 */
export function useBackups(): void {
  const groups = useEditorStore((state) => state.groups);
  const loadPending = useRecoveryStore((state) => state.load);

  // Al arrancar, una sola vez: si quedó algo de un cierre anterior, se ofrece.
  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  useEffect(() => {
    const timer = setInterval(() => {
      void backupDirtyTabs();
    }, BACKUP_INTERVAL_MS);

    return () => {
      clearInterval(timer);
    };
    // Sin dependencias: el intervalo no se tiene que reiniciar cada vez que
    // cambia una pestaña, o con alguien tipeando nunca llegaría a cumplirse.
  }, []);

  // Lo que ya no está sucio no tiene por qué seguir respaldado: un backup
  // huérfano se ofrecería restaurar en el próximo arranque, pisando el archivo
  // guardado con una versión vieja. `pendingBackups` también lo filtra por
  // `mtime`, pero borrarlo acá es lo que evita que el directorio crezca sin fin.
  useEffect(() => {
    void discardClean(groups);
  }, [groups]);
}

/** Escribe un respaldo por cada pestaña con cambios sin guardar. */
async function backupDirtyTabs(): Promise<void> {
  for (const { path } of dirtyTabs()) {
    const content = contentOf(path);

    // Sin modelo no hay nada que respaldar. Pasa con una pestaña restaurada de
    // la sesión anterior que todavía no se abrió en el editor.
    if (content === undefined) continue;

    await window.pastecode.invoke('backups:write', { path, content });
  }
}

/** Borra los respaldos de los archivos que ya no tienen cambios sin guardar. */
async function discardClean(groups: ReturnType<typeof currentGroups>): Promise<void> {
  const dirty = new Set(dirtyTabs().map((tab) => tab.path));

  for (const path of allOpenPaths(groups)) {
    if (!dirty.has(path)) {
      await window.pastecode.invoke('backups:discard', { path });
    }
  }
}

/** Las pestañas sucias, sin repetir las que están abiertas en los dos grupos. */
function dirtyTabs(): { path: string }[] {
  const seen = new Set<string>();
  const dirty: { path: string }[] = [];

  for (const group of currentGroups().groups) {
    for (const tab of group.tabs.tabs) {
      if (!tab.isDirty || seen.has(tab.path)) continue;

      seen.add(tab.path);
      dirty.push({ path: tab.path });
    }
  }

  return dirty;
}

/** Los grupos del momento. Se leen con `getState`: el intervalo no reacciona. */
function currentGroups(): ReturnType<typeof useEditorStore.getState>['groups'] {
  return useEditorStore.getState().groups;
}
