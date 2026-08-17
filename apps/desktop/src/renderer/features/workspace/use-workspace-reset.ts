import { useEffect } from 'react';

import { useEditorStore } from '../../stores/editor-store.js';
import { useFileIndexStore } from '../../stores/file-index-store.js';
import { useFileTreeStore } from '../../stores/file-tree-store.js';
import { useProblemsStore } from '../../stores/problems-store.js';
import { useWorkspaceStore } from '../../stores/workspace-store.js';
import { releaseAllModels } from '../editor/model-registry.js';
import { forgetLspDocuments } from '../lsp/document-sync.js';

/**
 * Deja la aplicación en cero cada vez que cambia el workspace.
 *
 * Está acá y no en `App` porque la lista de cosas que hay que olvidar crece con
 * cada feature —pestañas, modelos, índice de quick open, diagnósticos,
 * documentos del LSP— y `App` no tiene por qué ser el lugar donde esa lista
 * vive. Que sea una sola función también hace evidente lo que hay que agregar
 * cuando aparezca la feature siguiente.
 *
 * Git no aparece en la lista: el main ya avisa por `git:changed` con el
 * repositorio del workspace nuevo —o con `null`— apenas se abre.
 *
 * @example
 * useWorkspaceReset(); // una vez, en el cascarón de la app
 */
export function useWorkspaceReset(): void {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const loadRoot = useFileTreeStore((state) => state.loadRoot);
  const clearTree = useFileTreeStore((state) => state.clear);
  const clearIndex = useFileIndexStore((state) => state.clear);
  const clearProblems = useProblemsStore((state) => state.clear);
  const closeAll = useEditorStore((state) => state.closeAll);

  useEffect(() => {
    // Los modelos se desechan a mano: no los recoge el recolector de basura
    // mientras Monaco los tenga indexados por URI.
    closeAll();
    releaseAllModels();
    // El índice de quick open es de un workspace: conservarlo ofrecería
    // archivos de la carpeta anterior.
    clearIndex();
    // Los diagnósticos y el mapa de servidores también: el main ya apagó los
    // servidores del workspace anterior, así que lo que quedara acá son errores
    // de archivos que ya no se pueden abrir.
    clearProblems();
    forgetLspDocuments();

    if (workspace === null) clearTree();
    else void loadRoot(workspace.root);
  }, [workspace, loadRoot, clearTree, clearIndex, clearProblems, closeAll]);
}
