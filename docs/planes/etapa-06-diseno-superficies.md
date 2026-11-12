# Etapa 6 — Diseño II: superficies nuevas

[← Etapa 5](./etapa-05-diseno-estructura.md) · [Planes de ejecución](./README.md) · [Siguiente: emulador I →](./etapa-07-emulador-control.md)

**Rama:** `claude/ide-exponential-improvements-mh7gtv-e6` · **PR contra:** `claude/ide-exponential-improvements-mh7gtv-e5`

## Objetivo

Las vistas que faltan para que alguien que abre PasteCode por primera vez sepa qué hacer: una bienvenida con las carpetas recientes, una configuración que no obligue a editar JSON, y la interacción directa que cualquier editor trae —arrastrar pestañas y archivos, modo zen, un tercer panel—.

Se apoya en lo de la [etapa 5](./etapa-05-diseno-estructura.md): menús, notificaciones y tokens ya existen.

## Orden y prioridad

La etapa es grande. Las tareas están **ordenadas por valor**, y la regla de oro del proyecto vale acá más que en ninguna otra: _menos features mejor terminadas_. Si no entra todo, se cierran las primeras con sus tests y su documentación, y las que no entraron quedan anotadas en `PROGRESO.md` como abiertas. Una tarea a medias no se entrega.

## Leer antes

- `main/ipc/workspace.ts` y `main/services/workspace.ts`, como quedaron después de la etapa 3 (confianza de workspace).
- `packages/core/src/settings/schema.ts` y `merge.ts`.
- `packages/core/src/workspace/tabs.ts` y `groups.ts`; [ADR-0023](../adr/0023-dos-grupos-sobre-modelos-compartidos.md).
- `renderer/features/commands/` entero: `default-keybindings.ts`, `key-combination.ts`, `use-keybindings.ts`.
- `renderer/features/editor/EditorArea.tsx`.

---

## Tareas

### T1 — Bienvenida y carpetas recientes

**La lista de recientes.**

- `packages/core/src/workspace/recents.ts`, puro y con tests: el schema, agregar una entrada (la más nueva primero, sin duplicados, con un máximo), y quitar una. La comparación de rutas es la misma que usa la confianza de workspace: no `===`.
- `main/services/recent-workspaces.ts`: carga y guarda en el directorio de datos del usuario con `writeTextFileAtomically`. Al leer, descarta las carpetas que ya no existen. Se actualiza cada vez que se abre un workspace.

**El contrato.**

| Canal                    | Qué lleva                                               |
| ------------------------ | ------------------------------------------------------- |
| `workspace:listRecent`   | Nada. Devuelve nombre, ruta e identificador de cada una |
| `workspace:openRecent`   | **Un identificador**, no una ruta                       |
| `workspace:removeRecent` | Un identificador                                        |

**El renderer nunca manda una ruta raíz.** Hoy un workspace sólo se abre por el diálogo nativo, y eso es una propiedad de seguridad que el informe destacó. `openRecent` la conserva: el main busca el identificador en la lista que él mismo escribió. La ruta viaja hacia el renderer sólo para mostrarla.

`openRecent` pasa por **el mismo camino** que abrir por diálogo, incluida la pregunta de confianza de la etapa 3. Extraé lo común de `handleOpenWorkspace`; no lo copies.

**La vista.** `features/welcome/Welcome.tsx`, en el área de edición cuando no hay workspace: el botón de abrir carpeta (dispara el comando `workspace.open`), la lista de recientes navegable por teclado, y los tres o cuatro atajos que más importan. El texto de estado vacío que hoy se muestra ahí lo puede estar usando un spec: conservalo.

Con workspace abierto y sin pestañas, una versión mínima: sólo los atajos.

En el menú _Archivo_ de `menu-registry.ts`: _Abrir reciente_.

### T2 — Configuración gráfica (RF-706)

**Dónde vive.** Las pestañas del editor son rutas de archivo; convertir la configuración en una pestaña obligaría a inventar documentos virtuales en `core`, en la sesión y en el registro de modelos. No vale lo que cuesta: va como un **diálogo modal a pantalla casi completa**, con el molde de `ApiKeyDialog` y `ThemePicker`. Comando `settings.open`, atajo `ctrl+,`, entrada en el menú.

**El formulario sale de datos.**

- En `packages/core`: una lista de descriptores, uno por setting —clave, tipo de control, rango, claves de i18n para el nombre y la descripción, y si es sólo de usuario—.
- **Un test que recorre `SettingsSchema` y falla si alguna hoja no tiene descriptor.** Es lo que impide que una setting nueva quede sin interfaz.
- Controles: número, booleano, enumerado, texto, lista de textos (`files.exclude`) y ruta opcional. Los mapas (`lsp.serverPaths`) se muestran como pares clave/valor.

**Alcance: usuario o workspace.**

- Un selector arriba. _Workspace_ está deshabilitado si no hay carpeta abierta o si está en modo restringido.
- Las settings sólo de usuario se muestran deshabilitadas en el alcance de workspace, con el motivo.
- **Qué es "sólo de usuario" tiene que tener una sola fuente.** Hoy está escrito a mano adentro de `resolveSettings`. Exportá la lista desde `core` y agregá un test que demuestre que coincide con lo que `resolveSettings` hace de verdad: para cada clave de la lista, un valor puesto por el workspace no gana.

**Escribir.** Por `settings:update`, parcial, como ya funciona. Se valida en el cliente con el mismo schema antes de mandar, y el error se muestra al lado del campo. Si el archivo de settings está inválido, el diálogo muestra el error que `settings:get` ya devuelve.

### T3 — Arrastrar pestañas

`moveTab` ya existe en `core`. Falta la interfaz.

- Arrastre con los eventos nativos de HTML, con un indicador de dónde va a caer.
- Entre los dos grupos también: función nueva en `core` para mover una pestaña de un grupo a otro, con tests.
- **Alternativa de teclado** (RNF-21): comandos `editor.moveTabLeft` y `editor.moveTabRight`.
- El cierre con la ruedita (`middle-click-close.ts`) tiene que seguir andando.

### T4 — Modo zen (RF-111)

Comando `view.toggleZen`: oculta la barra de actividades, las vistas laterales, el panel inferior, el panel auxiliar y la barra de estado. Un atributo en `.app` y CSS; al salir, restaura exactamente lo que había.

- Salir tiene que ser obvio: el mismo comando, y `Escape` dos veces.
- Pantalla completa opcional con un canal nuevo, `window:setFullScreen`. Verificá el método en `electron.d.ts`.
- La barra de título se queda, mínima: sin ella la ventana no se puede mover ni cerrar.

### T5 — Migas de pan (RF-110, parcial)

Sobre el editor: los segmentos de la ruta relativa al workspace, hasta el archivo. Click en un segmento lo muestra en el árbol.

**Sólo la ruta.** La parte de símbolos necesita `textDocument/documentSymbol`, que llega en la [etapa 9](./etapa-09-ide-lenguaje.md). Dejá el componente preparado para recibir segmentos extra y anotá RF-110 como parcial.

### T6 — Arrastrar en el árbol (RF-006)

- Arrastrar un archivo o carpeta sobre una carpeta lo mueve, con `fs:rename`, que ya valida las rutas en el main.
- Función pura en `core` que diga si un movimiento es válido: no sobre sí mismo, no adentro de un descendiente, no si no cambia nada. Con tests.
- **Mover pide confirmación**, con el diálogo que ya usa eliminar. Un arrastre accidental no puede reorganizar un proyecto.
- Si el archivo movido está abierto, su pestaña sigue al archivo. Renombrar ya resuelve esto: reusalo.
- Alternativa de teclado: cortar y pegar en el árbol, o un comando _Mover a…_.

### T7 — Editor de atajos

- Lista de comandos con su atajo actual y de dónde sale (por omisión o del usuario).
- Los conflictos, usando lo que `packages/core/src/keybindings/` ya detecta.
- Reasignar: un campo que captura la combinación con `key-combination.ts`.
- Hoy sólo existe `keybindings:get`. Escribir necesita un canal nuevo, `keybindings:update`: contrato primero, validado con `KeybindingsFileSchema`, escritura atómica del archivo del usuario.

Si el tiempo no alcanza para reasignar, entregá la lista con los conflictos, de sólo lectura, y anotalo.

### T8 — Tercer grupo de editor (RF-107)

`MAX_GROUPS` vale 2. ADR-0023 dice que el módulo puro está escrito para N y que lo que falta es interfaz. Verificalo antes de creerlo: buscá todo lo que asuma dos grupos (`PRIMARY_GROUP_ID`, `SECONDARY_GROUP_ID`, la clave de contexto `hasSecondGroup`, los layouts).

Es la última tarea a propósito: es la que más puede romper. El comentario de `App.tsx` sobre `releaseModelsExcept` describe "el bug número uno de esta feature"; con tres grupos vale igual.

### T9 — Documentación

- `docs/03-requerimientos-funcionales.md`: RF-006, RF-107, RF-110 (parcial), RF-111 y RF-706, cada uno con lo que se entregó de verdad.
- `docs/05-modelo-de-datos.md`: el archivo de recientes.
- `docs/convenciones/seguridad.md`: una línea sobre `workspace:openRecent` y por qué lleva un identificador.
- `CHANGELOG.md` y `PROGRESO.md`, con la lista explícita de lo que no entró.

---

## Criterios de aceptación

1. Los cuatro comandos de verificación pasan, y el CI del PR está en verde.
2. La suite E2E existente pasa sin modificar ningún spec.
3. Ningún canal nuevo recibe del renderer una ruta raíz de workspace.
4. Toda setting del schema tiene control en la configuración gráfica, y un test lo garantiza.
5. La lista de settings sólo de usuario tiene una sola fuente, verificada contra `resolveSettings`.
6. Todo lo que se hace arrastrando se puede hacer también con el teclado.
7. Cada tarea entregada tiene sus tests; cada tarea no entregada está listada en `PROGRESO.md`.

## Trampas

- **El diálogo de configuración y el foco.** Un modal que no atrapa el foco deja tabular hacia el editor de atrás; uno que no lo devuelve al cerrar deja al usuario en ningún lado. Mirá cómo lo resuelven los diálogos que ya existen.
- **Escribir settings en cada tecla** dispara la recarga en caliente de todo. Esperá a que el campo pierda el foco o usá un retardo.
- **`ctrl+,`** : verificá en `key-combination.ts` cómo se normaliza la coma antes de escribir el atajo.
- **Los eventos de arrastre de HTML y Monaco.** Monaco tiene su propio arrastre de texto. El de pestañas vive en la tira de pestañas y no tiene que filtrarse al editor.
- **RNF-01.** La bienvenida se ve en el arranque sin workspace: no puede esperar a la lista de recientes para pintar. Primero el botón, después la lista.
