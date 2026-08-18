import type { Command } from '@pastecode/core';

import { useFileTreeStore } from '../../stores/file-tree-store.js';
import { useWorkspaceStore } from '../../stores/workspace-store.js';

/**
 * Los comandos de crear del árbol (RF-003).
 *
 * Renombrar y eliminar **no** están acá: los dos necesitan una entrada elegida,
 * y el árbol ya sabe cuál es la que tiene el foco. Un comando de paleta no
 * tiene esa noción, así que viven en el teclado del árbol —`F2` y `Delete`—,
 * que además son las teclas que todo el mundo ya conoce.
 *
 * Crear sí entra bien en la paleta porque el destino es una carpeta y siempre
 * hay una razonable: la que está desplegada y enfocada, o la raíz.
 *
 * @returns Los comandos, listos para registrar.
 * @example
 * for (const command of treeCommands()) register(command);
 */
export function treeCommands(): readonly Command[] {
  return [
    {
      id: 'fileTree.newFile',
      title: 'command.fileTreeNewFile',
      handler: () => {
        startCreate(false);
      },
    },
    {
      id: 'fileTree.newFolder',
      title: 'command.fileTreeNewFolder',
      handler: () => {
        startCreate(true);
      },
    },
  ];
}

/**
 * Abre el campo de creación sobre la raíz del workspace.
 *
 * Sin workspace abierto no hay dónde crear, y la respuesta correcta es no hacer
 * nada: el comando aparece en la paleta igual, pero no puede fabricar una raíz.
 */
function startCreate(isDirectory: boolean): void {
  const root = useWorkspaceStore.getState().workspace?.root;

  if (root === undefined) return;

  useFileTreeStore.getState().startCreate(root, isDirectory);
}
