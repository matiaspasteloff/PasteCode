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

> **Nota de alcance (`isDirty`), Etapa 3.** Se guarda porque el schema lo declara, pero **al restaurar se ignora y toda pestaña vuelve limpia**. No se hace backup del contenido sin guardar, así que al reabrir el archivo es el que está en disco; un punto de "sin guardar" sobre un archivo idéntico al disco sería mentirle a alguien sobre si perdió su trabajo. El backup real —el _hot exit_ de VS Code— no está en el alcance de esta versión.

**Restaurar descarta en silencio** los archivos que ya no existen, y el filtrado ocurre **en el main**: el renderer no puede saber qué existe sin pedirlo, y pedir algo borrado deja un error en pantalla. Entre una sesión y la otra pasó un `git checkout`, y un diálogo por cada archivo que desapareció es un diálogo que todo el mundo aprende a cerrar sin leer.

| Canal          | Request                                         | Response                                           |
| -------------- | ----------------------------------------------- | -------------------------------------------------- |
| `session:load` | `{}`                                            | `{ state }` — ya filtrado, o `null` la primera vez |
| `session:save` | `{ openTabs, activeTabIndex, expandedFolders }` | `{}`                                               |

El `rootPath` y el `lastSavedAt` los pone el main: el primero porque dejar que el renderer lo mande sería dejarle elegir de qué workspace leer la sesión, y el segundo porque el reloj del que escribe es el único que puede dar esa marca sin mentir.

## Schema de settings

Los campos y sus rangos están en `packages/core/src/settings/schema.ts`, y los valores por defecto en la constante `DEFAULT_SETTINGS` del mismo archivo:

| Grupo      | Claves                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| `editor`   | `fontSize`, `fontFamily`, `tabSize`, `insertSpaces`, `wordWrap`, `minimap`, `formatOnSave`, `renderWhitespace` |
| `files`    | `autoSave`, `autoSaveDelay`, `exclude`, `trimTrailingWhitespace`                                               |
| `terminal` | `shell` (`null` = el del sistema operativo), `fontSize`                                                        |
| `window`   | `theme`, `zoomLevel`                                                                                           |

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

**`terminal.shell` es la excepción: el workspace no puede setearlo.** Es la única clave con la precedencia invertida, y existe porque un `.pastecode/settings.json` viaja adentro de cualquier repositorio clonado. Ver [Procesos hijo y binarios externos](./convenciones/seguridad.md#procesos-hijo-y-binarios-externos).

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

## Contrato del portapapeles

`clipboard:readText` y `clipboard:writeText`, sólo texto plano. Existen para [RF-304](./03-requerimientos-funcionales.md#terminal-integrada): en una terminal, `Ctrl+C` es la señal de interrupción y no se la puede usar para copiar.

Va por IPC y no por `navigator.clipboard` porque la API del navegador necesita un contexto seguro **y** que el manejador de permisos de Electron conceda `clipboard-read`; son dos condiciones que se configuran lejos del código que las usa y que un cambio futuro puede romper en silencio. El módulo `clipboard` del main no depende de ninguna de las dos.

## Contrato de IPC

Definido en `packages/ipc-contract`. Ver [Arquitectura · Patrón de IPC](./02-arquitectura.md#patrón-de-ipc) y, para los eventos, [ADR-0013](./adr/0013-eventos-tipados-en-el-ipc.md).

---

[← Requerimientos no funcionales](./04-requerimientos-no-funcionales.md) · [Índice](./README.md) · [Siguiente: Roadmap →](./06-roadmap-y-riesgos.md)
