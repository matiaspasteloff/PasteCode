import type { Breakpoint } from '@pastecode/core';
import { activeTab, breakpointsIn } from '@pastecode/core';
import type * as MonacoApi from 'monaco-editor/editor/editor.api';
import { useEffect, useRef } from 'react';

import { useDebugStore } from '../../stores/debug-store.js';
import { selectActiveTabs, useEditorStore } from '../../stores/editor-store.js';
import { getLoadedMonaco, onEditorCreated } from '../editor/monaco-instance.js';
import { isSamePath } from '../editor/same-path.js';

/**
 * Enchufa los breakpoints al editor
 * ([RF-502](../../../../../docs/03-requerimientos-funcionales.md)).
 *
 * Dos mitades: el click en el margen de glifos que los pone y los saca, y las
 * marcas que los dibujan. La lista misma vive en el store, porque un breakpoint
 * en un archivo cerrado sigue existiendo.
 *
 * @example
 * useBreakpoints(); // una vez, en el cascarón de la app
 */
export function useBreakpoints(): void {
  const activePath = useEditorStore(
    (state) => activeTab(selectActiveTabs(state))?.path ?? null
  );
  const breakpoints = useDebugStore((state) => state.breakpoints);

  // La ruta va por ref y no por dependencia: el listener del editor se
  // engancha una vez, y volver a engancharlo en cada cambio de pestaña
  // dispararía un ciclo de suscribir/desuscribir por cada click en el árbol.
  const pathRef = useRef(activePath);

  pathRef.current = activePath;

  useGutterClicks(pathRef);
  useDecorations(activePath, breakpoints);
}

/**
 * Un click en el margen de glifos pone o saca el breakpoint de esa línea.
 *
 * Se engancha por `onEditorCreated` y no con `getActiveEditor()` porque Monaco
 * se importa perezosamente: cuando cambia la pestaña activa la instancia puede
 * no existir todavía, y un efecto que mire en ese momento no encuentra nada y
 * no se vuelve a ejecutar. Fue exactamente el bug que encontró el E2E.
 */
function useGutterClicks(activePath: React.RefObject<string | null>): void {
  useEffect(() => {
    const subscriptions: { dispose: () => void }[] = [];
    const stop = onEditorCreated((editor) => {
      // Monaco se lee **acá adentro** y no afuera: el efecto corre una sola vez
      // —su única dependencia es una ref—, y en ese momento Monaco todavía no
      // se importó. Si hay un editor, el módulo ya está cargado.
      const monaco = getLoadedMonaco();

      if (monaco === null) return;

      subscriptions.push(
        editor.onMouseDown((mouse) => {
          // Sólo el margen de glifos. El número de línea es de Monaco
          // —seleccionar la línea entera— y robárselo rompería una interacción
          // que la gente ya tiene en los dedos.
          if (mouse.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return;

          const path = activePath.current;

          if (path === null) return;

          useDebugStore.getState().toggle(path, mouse.target.position.lineNumber);
        })
      );
    });

    return () => {
      stop();
      for (const subscription of subscriptions) subscription.dispose();
    };
  }, [activePath]);
}

/**
 * Dibuja los breakpoints del archivo activo.
 *
 * Se repinta en dos momentos y hacen falta los dos: cuando cambia la lista o la
 * pestaña, y **cuando nace la instancia de editor**. Lo segundo no es un
 * detalle: al restaurar una sesión los breakpoints llegan del main antes de que
 * Monaco termine de importarse, así que un efecto que sólo mire el estado
 * encuentra el editor en `null`, se va, y no se vuelve a ejecutar. El síntoma
 * era un breakpoint que se guardaba bien y no se veía al reabrir.
 *
 * La colección se rehace entera en vez de calcular un delta: son unas pocas
 * líneas por archivo, y `createDecorationsCollection` ya reemplaza todo de una.
 */
function useDecorations(activePath: string | null, breakpoints: readonly Breakpoint[]): void {
  useEffect(() => {
    const disposables: { dispose: () => void }[] = [];
    const collections: MonacoApi.editor.IEditorDecorationsCollection[] = [];

    const paint = (editor: MonacoApi.editor.IStandaloneCodeEditor): void => {
      const monaco = getLoadedMonaco();

      if (monaco === null || activePath === null) return;

      // Sólo el editor que está mostrando ese archivo: con la pantalla partida
      // hay dos instancias, y pintar en las dos pondría los breakpoints de un
      // archivo sobre el otro.
      if (!isSamePath(editor.getModel()?.uri.fsPath, activePath)) return;

      collections.push(
        editor.createDecorationsCollection(
          breakpointsIn(breakpoints, activePath).map((breakpoint) =>
            toDecoration(monaco, breakpoint.line, breakpoint.enabled)
          )
        )
      );
    };

    const stop = onEditorCreated((editor) => {
      paint(editor);

      // **Y también cuando cambie de modelo.** Al restaurar una sesión los
      // breakpoints llegan antes de que el editor tenga cargado el archivo, así
      // que la primera pintada no encuentra a quién pintarle. Sin esto, un
      // breakpoint restaurado se guardaba bien y no se veía nunca.
      disposables.push(
        editor.onDidChangeModel(() => {
          paint(editor);
        })
      );
    });

    return () => {
      stop();
      for (const disposable of disposables) disposable.dispose();
      for (const collection of collections) collection.clear();
    };
  }, [activePath, breakpoints]);
}

/** Un breakpoint como marca del margen de glifos. */
function toDecoration(
  monaco: typeof MonacoApi,
  line: number,
  enabled: boolean
): MonacoApi.editor.IModelDeltaDecoration {
  return {
    range: new monaco.Range(line, 1, line, 1),
    options: {
      glyphMarginClassName: `breakpoint-glyph${enabled ? '' : ' breakpoint-glyph--disabled'}`,
      // Sigue a la línea cuando alguien escribe arriba, que es lo que hace que
      // el breakpoint no se quede apuntando a otro lado mientras se edita. Lo
      // que pasa **afuera** del editor lo corrige `shiftBreakpoints`.
      stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
    },
  };
}
