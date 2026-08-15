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

## Contrato de IPC

Definido en `packages/ipc-contract`. Ver [Arquitectura · Patrón de IPC](./02-arquitectura.md#patrón-de-ipc).

---

[← Requerimientos no funcionales](./04-requerimientos-no-funcionales.md) · [Índice](./README.md) · [Siguiente: Roadmap →](./06-roadmap-y-riesgos.md)
