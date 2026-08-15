# 02 — Arquitectura del sistema

[← Visión y alcance](./01-vision-y-alcance.md) · [Índice](./README.md) · [Siguiente: Requerimientos funcionales →](./03-requerimientos-funcionales.md)

> Las decisiones que llevaron a esta arquitectura están registradas en los [ADRs](./adr/).

---

## Modelo de procesos

```
┌─────────────────────────────────────────────────────────────────┐
│                       MAIN PROCESS (Node)                       │
│  • Ciclo de vida de la app y ventanas                           │
│  • Acceso a filesystem (única fuente de verdad)                 │
│  • Supervisión de procesos hijo (LSP, DAP, PTY)                 │
│  • Persistencia de settings y estado de workspace               │
│  • Menús nativos, diálogos, auto-update                         │
└───────┬───────────────────────┬────────────────────┬────────────┘
        │ contextBridge         │ MessagePort        │ stdio/JSON-RPC
        │ (IPC tipado)          │ (RPC tipado)       │
┌───────▼──────────────┐ ┌──────▼──────────────┐ ┌───▼────────────┐
│  RENDERER PROCESS    │ │  EXTENSION HOST     │ │ PROCESOS HIJO  │
│  (Chromium, sandbox) │ │  (utilityProcess)   │ │                │
│                      │ │                     │ │ • Servers LSP  │
│  • Monaco Editor     │ │ • Extensiones de    │ │ • Adapters DAP │
│  • Árbol de archivos │ │   terceros aisladas │ │ • node-pty     │
│  • Terminal (xterm)  │ │ • API pública       │ │ • ripgrep      │
│  • Paleta comandos   │ │ • Timeouts          │ │                │
│  • SIN acceso a fs   │ │ • Reinicio en crash │ │                │
└──────────────────────┘ └─────────────────────┘ └────────────────┘
```

**Regla arquitectónica inviolable:** el proceso renderer **nunca** accede al filesystem, a `child_process`, ni a ningún módulo de Node. Toda operación privilegiada pasa por IPC hacia el main. Ver [Seguridad](./convenciones/seguridad.md).

### Por qué el extension host está separado

Las extensiones son código de terceros. Si corren en el renderer, una extensión con un loop infinito congela la UI; si corren en el main, pueden tumbar la app entera. Ver [ADR-0003](./adr/0003-extension-host-aislado.md).

## Estructura del monorepo

```
forge/
├── apps/
│   └── desktop/                 # Aplicación Electron
│       ├── src/
│       │   ├── main/            # Proceso principal
│       │   │   ├── index.ts
│       │   │   ├── windows/     # Gestión de ventanas
│       │   │   ├── ipc/         # Handlers IPC (uno por dominio)
│       │   │   ├── services/    # FileSystem, Git, Settings, Process
│       │   │   └── supervisors/ # LSP, DAP, PTY
│       │   ├── preload/         # contextBridge — única superficie expuesta
│       │   │   └── index.ts
│       │   └── renderer/        # UI
│       │       ├── main.tsx
│       │       ├── features/    # Vertical slices por feature
│       │       ├── components/  # UI compartida
│       │       ├── stores/      # Estado
│       │       └── styles/
│       └── electron-builder.yml
├── packages/
│   ├── core/                    # Lógica pura, sin dependencias de Electron
│   │   ├── src/
│   │   │   ├── workspace/
│   │   │   ├── commands/        # Registry de comandos
│   │   │   ├── keybindings/     # Parser y resolver de atajos
│   │   │   └── settings/        # Schema y validación
│   ├── ipc-contract/            # Tipos compartidos main ↔ renderer
│   ├── extension-api/           # API pública para extensiones
│   ├── extension-host/          # Runtime del host de extensiones
│   └── ui/                      # Design system
├── extensions/
│   ├── theme-nord/              # Extensión de ejemplo — tema
│   └── word-count/              # Extensión de ejemplo — status bar
├── docs/
├── e2e/                         # Tests Playwright
├── PROJECT.md
├── CLAUDE.md
└── package.json
```

## Regla de dependencias

Las flechas van en una sola dirección.

```
renderer ──▶ ipc-contract ◀── main
   │                            │
   └──────▶ core ◀──────────────┘
                ▲
   extension-host ──▶ extension-api
```

- `packages/core` **no puede** importar nada de Electron, ni de React, ni de Node fuera de módulos puros. Debe poder correr en un test de Vitest sin ningún mock.
- `renderer` **no puede** importar de `main`. Nunca. Si necesita algo, se agrega al `ipc-contract`.
- Las dependencias circulares fallan el CI (`madge --circular`).

## Patrón de IPC

Todo el IPC es tipado de punta a punta y se define en `packages/ipc-contract`.

```typescript
// packages/ipc-contract/src/channels.ts
export interface IpcChannels {
  'fs:readFile': {
    request: { path: string; encoding?: 'utf8' | 'binary' };
    response: { content: string; mtime: number };
  };
  'fs:writeFile': {
    request: { path: string; content: string };
    response: { mtime: number };
  };
  'git:status': {
    request: { workspaceRoot: string };
    response: { staged: GitFileChange[]; unstaged: GitFileChange[] };
  };
}

export type ChannelName = keyof IpcChannels;
export type Request<C extends ChannelName> = IpcChannels[C]['request'];
export type Response<C extends ChannelName> = IpcChannels[C]['response'];
```

```typescript
// apps/desktop/src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';
import type { ChannelName, Request, Response } from '@forge/ipc-contract';

const api = {
  invoke: <C extends ChannelName>(channel: C, payload: Request<C>): Promise<Response<C>> =>
    ipcRenderer.invoke(channel, payload),
};

contextBridge.exposeInMainWorld('forge', api);
```

### Reglas de IPC

1. Nunca exponer `ipcRenderer` completo al renderer. Sólo el wrapper `invoke` de arriba.
2. Todo handler del main valida su input con Zod antes de tocar nada. **El renderer no es de confianza.**
3. Toda ruta de archivo recibida por IPC se resuelve y se verifica que esté dentro del workspace abierto. Ver [RNF-11](./04-requerimientos-no-funcionales.md#seguridad) y [validación de rutas](./convenciones/seguridad.md#validación-de-rutas).
4. Los canales se nombran `dominio:acción` en camelCase.
5. Al agregar un canal, se actualiza `packages/ipc-contract` **primero**. El contrato es la fuente de verdad.

---

[← Visión y alcance](./01-vision-y-alcance.md) · [Índice](./README.md) · [Siguiente: Requerimientos funcionales →](./03-requerimientos-funcionales.md)
