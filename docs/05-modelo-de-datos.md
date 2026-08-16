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

**Persistencia:** `~/.pastecode/workspaces/<hash-de-rootPath>.json`, guardado con debounce de 2s tras cualquier cambio. Satisface [RF-707](./03-requerimientos-funcionales.md#comandos-atajos-y-configuración).

## Schema de settings

```typescript
// packages/core/src/settings/schema.ts
import { z } from 'zod';

export const SettingsSchema = z.object({
  editor: z.object({
    fontSize: z.number().int().min(6).max(72).default(14),
    fontFamily: z.string().default('Consolas, "Courier New", monospace'),
    tabSize: z.number().int().min(1).max(16).default(2),
    insertSpaces: z.boolean().default(true),
    wordWrap: z.enum(['off', 'on', 'bounded']).default('off'),
    minimap: z.boolean().default(true),
    formatOnSave: z.boolean().default(false),
    renderWhitespace: z.enum(['none', 'boundary', 'all']).default('none'),
  }),
  files: z.object({
    autoSave: z.enum(['off', 'afterDelay', 'onFocusChange']).default('off'),
    autoSaveDelay: z.number().int().min(100).default(1000),
    exclude: z.array(z.string()).default(['**/node_modules', '**/.git', '**/dist']),
    trimTrailingWhitespace: z.boolean().default(true),
  }),
  terminal: z.object({
    shell: z.string().nullable().default(null), // null = shell por defecto del SO
    fontSize: z.number().int().min(6).max(72).default(13),
  }),
  window: z.object({
    theme: z.enum(['light', 'dark', 'system']).default('system'),
    zoomLevel: z.number().min(-5).max(5).default(0),
  }),
});

export type Settings = z.infer<typeof SettingsSchema>;
```

**Precedencia de settings** (de menor a mayor):

1. Valores por defecto del schema
2. `~/.pastecode/settings.json` (usuario)
3. `<workspace>/.pastecode/settings.json` (workspace)

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
