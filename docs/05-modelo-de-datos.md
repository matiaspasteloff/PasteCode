# 05 — Modelo de datos y contratos

[← Requerimientos no funcionales](./04-requerimientos-no-funcionales.md) · [Índice](./README.md) · [Siguiente: Roadmap →](./06-roadmap-y-riesgos.md)

---

## Estado del workspace

```typescript
interface WorkspaceState {
  /** Ruta absoluta de la carpeta raíz. */
  rootPath: string;
  /** Pestañas abiertas, en orden de aparición. */
  openTabs: TabState[];
  /** Índice de la pestaña activa. -1 si no hay ninguna. */
  activeTabIndex: number;
  /** Rutas de carpetas expandidas en el árbol, relativas a rootPath. */
  expandedFolders: string[];
  /** Breakpoints persistidos entre sesiones. */
  breakpoints: Breakpoint[];
  /** Momento del último guardado de estado, en epoch ms. */
  lastSavedAt: number;
}

interface TabState {
  /** URI del recurso. Ej: 'file:///c:/proyecto/src/index.ts' */
  uri: string;
  /** Posición del cursor. Líneas base-1, columnas base-1 (convención LSP). */
  cursorPosition: { line: number; column: number };
  /** Primera línea visible, para restaurar el scroll. */
  scrollTopLine: number;
  /** Si tiene cambios sin guardar. */
  isDirty: boolean;
  /** Si está anclada (no se cierra con "cerrar todas"). */
  isPinned: boolean;
}
```

**Persistencia:** `~/.pastecode/workspaces/<sha256-de-rootPath>.json`, guardado con debounce de 2s tras cualquier cambio, y forzado al cerrar la app —si sólo existiera el debounce, lo último que hizo alguien antes de cerrar se perdería siempre—. Satisface [RF-707](./03-requerimientos-funcionales.md#comandos-atajos-y-configuración).

El nombre es el hash y no la ruta escapada por dos razones: una ruta larga de Windows más el directorio de sesiones se pasa del límite de 260 caracteres, y una ruta contiene el nombre de usuario y la estructura de carpetas de alguien, que no hace falta desparramar en nombres de archivo.

> **Nota de alcance (`breakpoints`), Etapa 3.** El campo está listado arriba pero **el tipo `Breakpoint` no está definido en ninguna parte de esta documentación**: llega con el DAP en la Etapa 5. Hasta entonces el campo **no se escribe**. Para que eso no sea un problema, `WorkspaceStateSchema` es un objeto **laxo** —conserva las claves que no conoce— al revés que el schema de settings, que es estricto. La diferencia es deliberada: un `settings.json` lo escribe una persona y una clave desconocida es casi siempre un error de tipeo que hay que señalar; este archivo lo escribe la app, así que una clave desconocida significa que lo escribió una versión más nueva de PasteCode, y rechazarlo sería tirarle la sesión a alguien que abrió una beta una vez.

> **Nota de alcance (`isDirty`), Etapa 5.** Se guarda porque el schema lo declara, pero **al restaurar la sesión se sigue ignorando y toda pestaña vuelve limpia**. Lo que cambió en la Etapa 5 es que el contenido sin guardar ya no se pierde: [RNF-08](./04-requerimientos-no-funcionales.md#confiabilidad) lo respalda cada 30 segundos en `~/.pastecode/backups/`, y al reabrir se **ofrece** recuperarlo.
>
> Las dos cosas son deliberadamente independientes. La sesión dice qué pestañas había; el respaldo dice qué se estaba escribiendo. Restaurar la sesión no restaura contenido —eso lo decide una persona en el diálogo de recuperación—, porque el respaldo puede ser de hace media hora y el archivo en disco puede haberse editado con otra herramienta mientras tanto. Recuperar sin preguntar sería la pérdida de datos que RNF-07 y RNF-08 existen para evitar.
>
> Al recuperar, la pestaña queda **sucia**: lo que se muestra no es lo que hay en el disco, y una pestaña limpia diría que ya está guardado. El `mtimeMs` que se conserva es el del disco, así que `Ctrl+S` sobre lo recuperado detecta el conflicto de RF-004 si el archivo cambió mientras la app estuvo cerrada.

### Respaldos de recuperación

`~/.pastecode/backups/<sha256-de-la-ruta>.json`, uno por archivo con cambios sin guardar. El nombre es el hash por las mismas dos razones que en la sesión: el límite de 260 caracteres de Windows, y no desparramar la estructura de carpetas de alguien en nombres de archivo.

```ts
interface BackupFile {
  /** Ruta absoluta del archivo respaldado. El hash no se puede invertir. */
  path: string;
  /** Lo que había en el editor sin guardar. */
  content: string;
  /** Cuándo se escribió el respaldo. Se compara contra el `mtime` del archivo. */
  savedAt: number;
}
```

Se escribe con la misma escritura atómica que un guardado de verdad (RNF-07): un respaldo a medias haría que se ofrezca restaurar un archivo truncado, que es justo el trabajo que se quería no perder. Un respaldo se descarta —y se borra— cuando el archivo en disco es más nuevo, porque entonces alguien ya guardó y el contenido bueno es el del disco. Un respaldo de un archivo que **ya no existe** sí se ofrece: lo que quedó ahí es la única copia.

| Canal             | Request             | Response                     |
| ----------------- | ------------------- | ---------------------------- |
| `backups:write`   | `{ path, content }` | `{ savedAt }`                |
| `backups:pending` | `{}`                | `{ backups }` — ya filtrados |
| `backups:discard` | `{ path? }`         | `{}` — sin `path`, todos     |

**Restaurar descarta en silencio** los archivos que ya no existen, y el filtrado ocurre **en el main**: el renderer no puede saber qué existe sin pedirlo, y pedir algo borrado deja un error en pantalla. Entre una sesión y la otra pasó un `git checkout`, y un diálogo por cada archivo que desapareció es un diálogo que todo el mundo aprende a cerrar sin leer.

| Canal          | Request                                         | Response                                           |
| -------------- | ----------------------------------------------- | -------------------------------------------------- |
| `session:load` | `{}`                                            | `{ state }` — ya filtrado, o `null` la primera vez |
| `session:save` | `{ openTabs, activeTabIndex, expandedFolders }` | `{}`                                               |

El `rootPath` y el `lastSavedAt` los pone el main: el primero porque dejar que el renderer lo mande sería dejarle elegir de qué workspace leer la sesión, y el segundo porque el reloj del que escribe es el único que puede dar esa marca sin mentir.

> **Grupos de edición, desde la Etapa 4.** `WorkspaceState` gana `groups`,
> `layout` y `activeGroupId`, los tres **opcionales**, y conserva `openTabs`
> como espejo del grupo primario. Al leer, la ausencia de `groups` significa un
> solo grupo armado desde `openTabs`; al escribir se escriben las dos formas.
> Ésa es toda la migración, y es para lo que el schema es laxo
> ([ADR-0023](./adr/0023-dos-grupos-sobre-modelos-compartidos.md)).

## Schema de settings

Los campos y sus rangos están en `packages/core/src/settings/schema.ts`, y los valores por defecto en la constante `DEFAULT_SETTINGS` del mismo archivo:

| Grupo      | Claves                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| `editor`   | `fontSize`, `fontFamily`, `tabSize`, `insertSpaces`, `wordWrap`, `minimap`, `formatOnSave`, `renderWhitespace` |
| `files`    | `autoSave`, `autoSaveDelay`, `exclude`, `trimTrailingWhitespace`                                               |
| `git`      | `enabled`, `path` (`null` = resolvelo al arrancar), `decorationsEnabled`, `refreshIntervalMs` (`0` = nunca)    |
| `lsp`      | `enabled`, `serverPaths`, `requestTimeoutMs`, `maxDiagnosticsPerFile`, `idleShutdownMinutes`                   |
| `terminal` | `shell` (`null` = el del sistema operativo), `fontSize`                                                        |
| `window`   | `theme`, `zoomLevel`                                                                                           |

`lsp.serverPaths` es un mapa de `serverId` a ruta absoluta, con `null` para "usá el empaquetado". Es un `Record` y no un campo por lenguaje **a propósito**: la tabla de lenguajes crece con datos y no con código, así que agregar Python no puede obligar a tocar el schema.

**Son dos schemas y no uno**, y la diferencia es la que hace que esto funcione:

```typescript
/** Lo que se lee del disco: todo opcional, hasta los grupos. */
export const SettingsFileSchema = z.strictObject({
  version: z.literal(SETTINGS_VERSION).optional(),
  editor: z.strictObject(editorFields).partial().optional(),
  // ...
});

/** Lo que ve el resto de la aplicación: todo presente, todo válido. */
export const SettingsSchema = z.strictObject({
  editor: z.strictObject(editorFields),
  // ...
});
```

> **Nota de corrección, Etapa 3.** La versión original de este documento tenía un solo schema, con `.default()` en cada campo pero no en los grupos. Con eso, `SettingsSchema.parse({})` **fallaba**: un archivo parcial —el único que alguien escribe a mano— no se podía leer. Los defaults se sacaron de los campos y pasaron a ser una constante, porque la precedencia los necesita como una capa más del merge y no como un comportamiento adentro del parser. Ver [ADR-0005](./adr/0005-settings-en-json-con-schema-zod.md).

**Precedencia** (de menor a mayor):

1. `DEFAULT_SETTINGS`
2. `~/.pastecode/settings.json` (usuario)
3. `<workspace>/.pastecode/settings.json` (workspace)

Los objetos se combinan **por grupo** y los arrays se **reemplazan enteros**. Poner `editor.fontSize` en el workspace no borra el `editor.tabSize` del usuario; poner `files.exclude` sí reemplaza la lista completa, porque si concatenara no habría forma de **quitar** una exclusión heredada.

**Las claves que eligen un ejecutable son la excepción: el workspace no puede setearlas.** Son `terminal.shell`, `lsp.serverPaths` y `git.path`, y en las tres la precedencia queda invertida —gana el usuario— porque un `.pastecode/settings.json` viaja adentro de cualquier repositorio clonado, y clonar no puede ser lo mismo que aceptar ejecutar lo que el repositorio diga. Ver [Procesos hijo y binarios externos](./convenciones/seguridad.md#procesos-hijo-y-binarios-externos).

El campo `version` va desde el primer archivo escrito: [git.md](./convenciones/git.md#versionado) declara al formato como contrato público, y sin versión no hay forma de migrar un archivo viejo el día que cambie.

### Canales y evento

| Canal             | Request               | Response              |
| ----------------- | --------------------- | --------------------- |
| `settings:get`    | `{}`                  | `{ settings, error }` |
| `settings:update` | `{ scope, settings }` | `{ settings, error }` |

| Evento             | Payload                                              |
| ------------------ | ---------------------------------------------------- |
| `settings:changed` | `{ settings, error }` — lo emite el watcher del main |

El `error` viaja **al lado** de las settings y no en lugar de ellas: un archivo con una coma de más deja la aplicación andando con los últimos valores buenos **y** con algo que mostrar ([RNF-25](./04-requerimientos-no-funcionales.md#usabilidad-y-accesibilidad)). Devolver una cosa o la otra obligaría a elegir entre seguir funcionando y avisar.

## Contratos de LSP y de Git

Los dos dominios que agregó la Etapa 4. Las coordenadas son **base 1** en línea
y columna, como `SearchMatch` y `TabState`: la conversión a la base 0 del
protocolo vive **sólo** en `apps/desktop/src/main/lsp` ([ADR-0017](./adr/0017-cliente-lsp-con-vscode-jsonrpc.md)).

| Canal                   | Request                                | Response                             |
| ----------------------- | -------------------------------------- | ------------------------------------ |
| `lsp:openDocument`      | `{ path, languageId, version, text }`  | `{ serverId }` — `null` sin servidor |
| `lsp:changeDocument`    | `{ path, version, changes }`           | `{}`                                 |
| `lsp:closeDocument`     | `{ path }`                             | `{}`                                 |
| `lsp:completion`        | `{ path, position, triggerCharacter }` | `{ isIncomplete, items }`            |
| `lsp:resolveCompletion` | `{ serverId, id }`                     | `{ item }`                           |
| `lsp:hover`             | `{ path, position }`                   | `{ contents, range }`                |
| `lsp:definition`        | `{ path, position }`                   | `{ locations }`                      |
| `lsp:status`            | `{}`                                   | `{ servers }`                        |
| `git:getStatus`         | `{}`                                   | `{ repository }` — `null` sin repo   |
| `git:stage` / `unstage` | `{ paths }`                            | `{}`                                 |
| `git:commit`            | `{ message }`                          | `{}`                                 |
| `git:listBranches`      | `{}`                                   | `{ branches }`                       |
| `git:checkoutBranch`    | `{ branch }`                           | `{}`                                 |
| `git:getFileDiff`       | `{ path }`                             | `{ hunks }`                          |

| Evento              | Payload                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| `lsp:diagnostics`   | `{ serverId, documents }` — lotes de 30ms o 50 documentos                                               |
| `lsp:serverChanged` | `{ server }` — el hecho; `lsp:status` es la pregunta                                                    |
| `git:changed`       | `{ repository }` — el estado **resuelto**, como `settings:changed`                                      |
| `files:changed`     | `{ changes, isBulk }` — el watcher del workspace ([ADR-0020](./adr/0020-watcher-unico-con-chokidar.md)) |

El `id` de un ítem de completado es **su índice en la respuesta que lo produjo**,
y es lo único que vuelve para resolverlo: el objeto crudo del servidor, con su
campo `data` opaco, se queda en el main.

**Limitación documentada de Git:** la raíz del repositorio puede estar por
encima de la del workspace —si se abrió una subcarpeta—. Todo corre con `cwd` en
la raíz del workspace y se rechaza tocar archivos afuera aunque pertenezcan al
repositorio, así que [RNF-11](./04-requerimientos-no-funcionales.md#seguridad)
queda intacto en vez de tener una excepción tallada.

## Manifest de extensión

```json
{
  "name": "word-count",
  "displayName": "Word Count",
  "version": "1.0.0",
  "publisher": "tu-usuario",
  "engines": { "pastecode": "^1.0.0" },
  "main": "./dist/extension.js",
  "activationEvents": ["onLanguage:markdown"],
  "capabilities": ["statusBar", "documentRead"],
  "contributes": {
    "commands": [{ "command": "wordCount.toggle", "title": "Word Count: Toggle" }],
    "configuration": {
      "wordCount.enabled": { "type": "boolean", "default": true }
    }
  }
}
```

El campo `capabilities` es la base del modelo de seguridad de extensiones. Sin declaración, sin acceso. Ver [Seguridad · Modelo de amenazas](./convenciones/seguridad.md#modelo-de-amenazas--extensiones).

> **Verificado contra la implementación, Etapa 5.** El schema real vive en `packages/extension-host/src/manifest.ts`, atado al tipo público con un `satisfies`. Tres correcciones sobre el ejemplo de arriba:
>
> - **`main` es opcional.** Una extensión que sólo aporta un tema no tiene código, y exigirle un `activate` vacío obligaría a ejecutar un módulo de terceros para pintar colores. `theme-nord` no lo declara.
> - **Las capabilities son cuatro**, no dos: se agregó `documentWrite` al lado de `documentRead`. [RF-905](./03-requerimientos-funcionales.md) pide leer _y_ modificar, y juntarlas obligaría a pedir escritura para no usarla.
> - **`contributes.themes` existe** y es lo que hace posible [RF-906](./03-requerimientos-funcionales.md); el ejemplo sólo mostraba `commands` y `configuration`. Ojo con `configuration`: se puede declarar y **la API de esta etapa no tiene con qué leerlo**, así que `word-count` no lo usa.
>
> El manifest **no** se valida de forma estricta en su raíz, a propósito: es el `package.json` de la extensión y trae `scripts` y `devDependencies`. Las contribuciones sí, porque ahí una clave de más es un typo.

## Breakpoint

```typescript
interface Breakpoint {
  /** Ruta absoluta del archivo. */
  path: string;
  /** Línea **base 1**, igual que todo el resto del proyecto. */
  line: number;
  /** Apagarlo es distinto de borrarlo: uno desactivado se guarda igual. */
  enabled: boolean;
  /** Expresión que tiene que dar verdadero para frenar. Opcional. */
  condition?: string;
}
```

Es el tipo que [`WorkspaceState`](#estado-de-sesión) venía declarando **desde la Etapa 3 sin que existiera en ninguna parte**; el schema laxo de la sesión existe justamente para que pudiera aparecer sin migración ni bump de versión. Vive en `packages/core/src/debug/breakpoints.ts` con el `BreakpointSchema` que lo valida.

DAP habla base 1 en `setBreakpoints`, así que acá no hay traducción — a diferencia de LSP, que habla base 0 y tiene sus dos funciones de ±1 en un solo lugar.

## Contrato de comandos

```typescript
interface Command {
  /** Identificador único, formato 'namespace.acción'. */
  id: string;
  /** Título visible en la paleta de comandos. Clave de i18n. */
  title: string;
  /** Categoría para agrupar en la paleta. Opcional. */
  category?: string;
  /** Expresión de contexto que determina si está disponible. */
  when?: string;
  /** Handler. Puede ser async. Los errores se capturan y se muestran al usuario. */
  handler: (...args: unknown[]) => void | Promise<void>;
}
```

## Contrato de la terminal

Definido en `packages/ipc-contract/src/schemas/terminal.ts`. Cinco canales y dos eventos.

```typescript
/** Lo que el renderer conoce de una sesión viva. */
interface TerminalSession {
  sessionId: string;
  /** Nombre para el dropdown de RF-302, ya desambiguado: `powershell (2)`. */
  displayName: string;
  /** Pid del shell. Es lo que hace verificable a RF-305 en un test. */
  pid: number;
}
```

| Canal              | Request                     | Response                          |
| ------------------ | --------------------------- | --------------------------------- |
| `terminal:create`  | `{ cols, rows }`            | `TerminalSession`                 |
| `terminal:write`   | `{ sessionId, data }`       | `{}`                              |
| `terminal:resize`  | `{ sessionId, cols, rows }` | `{}`                              |
| `terminal:dispose` | `{ sessionId }`             | `{}`                              |
| `terminal:list`    | `{}`                        | `{ sessions: TerminalSession[] }` |

| Evento          | Payload                                                       |
| --------------- | ------------------------------------------------------------- |
| `terminal:data` | `{ sessionId, chunk }` — bytes crudos, con sus escapes ANSI   |
| `terminal:exit` | `{ sessionId, exitCode, signal }` — `signal` es un **número** |

Tres decisiones que el contrato fija y conviene no re-discutir:

- **`data` viaja sin interpretar.** El byte `0x03` es Ctrl+C y tiene que llegar al PTY como tal para que el shell mate al proceso en primer plano.
- **`chunk` conserva los escapes ANSI.** Normalizarlos en el main rompería el cursor, los colores y el redibujado de cualquier TUI. Interpretarlos es trabajo de xterm.
- **`signal` es un número y no un nombre.** Es lo que devuelve node-pty, que expone el valor crudo del sistema operativo. En Windows siempre es `null`: conpty no tiene señales.

El tamaño se valida en el schema (entero positivo) y se **acota** en `packages/core/src/terminal/dimensions.ts`. Son cosas distintas: un `cols: -1` es el renderer mandando algo imposible y se rechaza; un `cols: 4` es xterm midiendo un panel que todavía no terminó de aparecer, y ahí acotar es lo correcto.

## Contrato del índice de archivos

Un solo canal, para quick open ([RF-205](./03-requerimientos-funcionales.md#búsqueda-en-workspace)).

| Canal         | Request | Response               |
| ------------- | ------- | ---------------------- |
| `files:index` | `{}`    | `{ files, truncated }` |

```typescript
interface IndexedFile {
  /** Ruta absoluta. Es lo que se abre. */
  path: string;
  /** Relativa a la raíz, con `/`. Es lo que se muestra y lo que se matchea. */
  relativePath: string;
}
```

**El índice viaja entero, de una vez, y el matching corre en el renderer.** Es lo único que hace posible el presupuesto de 50ms por tecla de RF-205: con el índice del otro lado del IPC, cada letra costaría un salto de proceso. El precio es un mensaje grande al abrir quick open por primera vez; el beneficio es que después no hay ninguno.

Se construye **cuando el renderer lo pide**, no al abrir el workspace: recorrer el árbol entero antes de pintar la primera pantalla retrasaría el arranque, que es lo que mide [RNF-01](./04-requerimientos-no-funcionales.md#performance).

El recorrido es **por anchura** y con un tope de 20.000 archivos. Con un tope, eso importa: cortando un recorrido en profundidad entrarían todos los archivos de la primera rama y ninguno del resto. `truncated` dice que se cortó, y la UI lo muestra en vez de mentir por omisión.

## Contrato de la búsqueda

Definido en `packages/ipc-contract/src/schemas/search.ts`. Dos canales y dos eventos, porque los resultados llegan **mientras** ripgrep busca y no cuando termina: es lo que hace alcanzable el segundo de [RF-201](./03-requerimientos-funcionales.md#búsqueda-en-workspace). Ver [ADR-0007](./adr/0007-ripgrep-como-binario-externo.md).

| Canal           | Request                                                                       | Response |
| --------------- | ----------------------------------------------------------------------------- | -------- |
| `search:start`  | `{ searchId, query, isRegex, isCaseSensitive, matchWholeWord, includeGlobs }` | `{}`     |
| `search:cancel` | `{}`                                                                          | `{}`     |

| Evento          | Payload                                      |
| --------------- | -------------------------------------------- |
| `search:result` | `{ searchId, matches }` — un lote de matches |
| `search:done`   | `{ searchId, truncated, error }`             |

```typescript
interface SearchMatch {
  path: string;
  line: number;
  column: number;
  /** La línea entera, sin el salto. Es el contexto de RF-202. */
  preview: string;
  matchLength: number;
}
```

- **El `searchId` lo elige el renderer** y vuelve en cada evento. Sin él, los resultados de una consulta que se está cancelando se pintan sobre los de la siguiente: entre que se pide cancelar y que ripgrep muere, sigue escribiendo.
- **Las exclusiones no viajan en el request**: salen de `files.exclude` de las settings, que ya vive en el main. [RF-005](./03-requerimientos-funcionales.md#gestión-de-workspace-y-archivos) dice que ésa es la clave configurable y el schema de settings no tiene ninguna sección `search.*`.
- **`truncated` es distinto de "no había más"**: dice que se cortó por el tope de 1.000 matches. La UI tiene que poder decir "al menos mil" sin mentir.
- **Un match por línea, no por ocurrencia.** Una línea con tres coincidencias es un resultado.

## Contrato del portapapeles

`clipboard:readText` y `clipboard:writeText`, sólo texto plano. Existen para [RF-304](./03-requerimientos-funcionales.md#terminal-integrada): en una terminal, `Ctrl+C` es la señal de interrupción y no se la puede usar para copiar.

Va por IPC y no por `navigator.clipboard` porque la API del navegador necesita un contexto seguro **y** que el manejador de permisos de Electron conceda `clipboard-read`; son dos condiciones que se configuran lejos del código que las usa y que un cambio futuro puede romper en silencio. El módulo `clipboard` del main no depende de ninguna de las dos.

## Contrato de IPC

Definido en `packages/ipc-contract`. Ver [Arquitectura · Patrón de IPC](./02-arquitectura.md#patrón-de-ipc) y, para los eventos, [ADR-0013](./adr/0013-eventos-tipados-en-el-ipc.md).

### Lo que agregó la Etapa 5

| Canal (renderer → main)                                              | Para qué                                        |
| -------------------------------------------------------------------- | ----------------------------------------------- |
| `extensions:getStatus` · `extensions:list`                           | Estado del host y qué hay cargado               |
| `extensions:executeCommand`                                          | Correr un comando de una extensión              |
| `extensions:documentResponse`                                        | La vuelta del pull del documento activo         |
| `extensions:activeEditorChanged`                                     | Qué documento está a la vista, **sin su texto** |
| `debug:getConfigurations` · `debug:getStatus`                        | El `launch.json` y si se puede depurar          |
| `debug:start` · `debug:stop` · `debug:step` · `debug:setBreakpoints` | RF-503                                          |
| `debug:getStackTrace` · `debug:getVariables`                         | RF-504                                          |
| `debug:evaluate`                                                     | RF-505                                          |

| Evento (main → renderer)                              | Payload                                                 |
| ----------------------------------------------------- | ------------------------------------------------------- |
| `extensions:hostChanged`                              | Estado del host supervisado, con su pid y sus reinicios |
| `extensions:changed`                                  | Lo cargado y los temas aportados, resuelto              |
| `extensions:contributionsChanged`                     | Comandos e ítems de la barra, resuelto                  |
| `extensions:documentRequest`                          | La ida del pull, con su `requestId`                     |
| `debug:stopped` · `debug:output` · `debug:terminated` | RF-503, RF-504, RF-505                                  |

**El protocolo main ↔ host no está acá.** `packages/ipc-contract` está documentado como el contrato main ↔ renderer, y el del host es otro límite: otro transporte —un `MessagePort` de `utilityProcess`—, otro modelo de confianza y otro ciclo de vida. Vive en `packages/extension-host/src/protocol.ts`, que es quien lo define; el main importa los tipos. Lo mismo con DAP, que además ni siquiera es nuestro: es un protocolo de terceros y sus tipos salen de `@vscode/debugprotocol`.

---

[← Requerimientos no funcionales](./04-requerimientos-no-funcionales.md) · [Índice](./README.md) · [Siguiente: Roadmap →](./06-roadmap-y-riesgos.md)
