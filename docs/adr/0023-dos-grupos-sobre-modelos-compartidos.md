# ADR-0023: Dos grupos de editor sobre modelos compartidos, y el schema laxo de sesión como mecanismo de migración

## Estado

`Aceptado`

**Fecha:** 2026-08-17

## Contexto

[RF-107](../03-requerimientos-funcionales.md) pide poder partir el área de edición en hasta **tres** grupos. Hasta este paso, `editor-store` tenía un `TabsState` plano —una lista de pestañas y un índice activo— y `monaco-instance` guardaba **una** referencia a **el** editor montado.

Tres cosas hacían falta decidir, y las tres tienen una respuesta que no es la obvia:

1. **Cuántos grupos entregar.** Tres son más caros de lo que parecen: el layout deja de ser una fila o una columna y pasa a ser un árbol de divisiones, y con él llegan los separadores arrastrables y los atajos por posición.
2. **Un modelo por grupo o uno compartido.** Monaco separa el `ITextModel` —el texto, el historial de undo, los marcadores— del editor que lo muestra, y esa separación es lo que hace posible la pregunta.
3. **Qué pasa con las sesiones ya guardadas.** `WorkspaceStateSchema` es un `looseObject` desde la Etapa 3, con un comentario que dice para qué: para que las claves de una versión nueva sobrevivan a un rollback.

## Decisión

**Dos grupos, un modelo por archivo compartido entre ellos, y el schema laxo como toda la migración.**

- `packages/core/src/workspace/tabs.ts` **no cambia en absoluto**. `TabsState` siempre tuvo forma de "por grupo", y ése es el punto: partir la pantalla no tocó una línea de cómo se abre, se cierra o se reordena una pestaña.
- Un módulo puro nuevo, `core/src/workspace/groups.ts`, con `splitGroups`, `closeGroup`, `focusGroup`, `updateGroup` y `allOpenPaths`. **Está escrito para N grupos**; `MAX_GROUPS` es 2 y subirlo no toca ninguna de esas funciones.
- `monaco-instance.ts` pasa de una referencia a un registro por grupo **conservando la firma de `getActiveEditor()`**. Eso es lo que mantiene chico el cambio: `use-session.ts`, `navigation.ts` y el gutter siguen preguntando "el editor" y siguen recibiendo el que la persona está mirando.
- `model-registry.ts` mantiene **un modelo por ruta, compartido por los dos grupos**; lo que se vuelve por grupo es el `viewState`.
- `mtimes`, `pendingFile` e `isLoading` siguen siendo globales: son del archivo, no del grupo.

**RF-107 se entrega con dos grupos y una nota de alcance.** El diferimiento es sólo de UI.

## Alternativas consideradas

| Opción                                              | Pros                                                                           | Contras                                                                                                                                                           | Por qué no                                                                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Un modelo por grupo**                             | Cada panel es independiente: undo propio, sin sorpresas                        | Editar el mismo archivo en dos paneles daría **dos textos distintos** que se pisan al guardar. Y duplica la memoria de cada archivo abierto en dos, contra RNF-04 | Es lo contrario de lo que la gente espera de un split: mirar la misma función arriba y abajo del archivo. Monaco está diseñado para lo otro |
| **Tres grupos ahora**                               | Cumple RF-107 al pie de la letra                                               | El layout deja de ser una fila o una columna y pasa a ser un árbol; llegan separadores arrastrables y atajos por posición                                         | Es UI, no modelo. `groups.ts` ya está escrito para N, así que el día que se agregue no hay que rehacer nada                                 |
| **Bump de versión + código de migración**           | Explícito                                                                      | Una función de migración por versión, para siempre, sobre un archivo cuyo peor caso es perder qué pestañas había abiertas                                         | El schema es laxo **exactamente para esto**, y estaba documentado desde la Etapa 3. Usarlo es cobrar una decisión que ya se había pagado    |
| **Dos grupos, modelos compartidos, schema laxo** ✅ | Editar el mismo archivo en dos paneles se mantiene sincronizado, undo incluido | Hay que acordarse de que ensuciar en un grupo ensucia en el otro                                                                                                  | —                                                                                                                                           |

## Consecuencias

- ✅ **Editar el mismo archivo en dos paneles se mantiene sincronizado**, historial de undo incluido, porque es literalmente el mismo `ITextModel`.
- ✅ **La migración de sesión no existe.** Se agregan `groups`, `layout` y `activeGroupId` **opcionales**; al leer, la ausencia de `groups` significa un solo grupo armado desde `openTabs`. Al escribir se escriben **las dos formas** —`groups` para esta versión y `openTabs` espejando el grupo primario— así que un build anterior restaura algo sensato en vez de una ventana vacía. Sin bump de versión y sin código de migración.
- ⚠️ **`releaseModelsExcept` tiene que mirar todos los grupos.** Es el riesgo de regresión número uno de esta feature: con la lista de un solo grupo, cerrar una pestaña desecha el modelo que el otro panel está mostrando y Monaco tira al siguiente render. `allOpenPaths(groups)` existe para eso y tiene su test.
- ⚠️ **El estado sucio se propaga a todos los grupos.** Un modelo compartido no puede estar sucio en un panel y limpio en el otro; marcarlo en un solo lugar dejaría una pestaña mintiendo.
- ⚠️ **Quién es "el editor activo" pasó a ser una pregunta con respuesta.** La contesta el `onDidFocusEditorText` de cada instancia, que es también lo que instala el lector de contenido: guardar escribe lo que la persona está mirando.
- ❌ **No hay arrastrar una pestaña de un grupo al otro.** `moveTabToGroup` no se escribió: sin drag and drop de pestañas —que tampoco existe todavía— no habría con qué dispararlo. Se agrega junto con el reordenamiento por arrastre.
