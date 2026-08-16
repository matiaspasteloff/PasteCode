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
pastecode/
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
- Las dependencias circulares fallan el CI, vía la regla `import-x/no-cycle` de ESLint. Ver [ADR-0010](./adr/0010-import-x-no-cycle.md).
- Esta regla de dependencias no vive sólo en este documento: está codificada como `no-restricted-imports` en la configuración de ESLint, así que violarla es un error de lint y no una cuestión de disciplina.

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
import type { ChannelName, Request, Response } from '@pastecode/ipc-contract';

const api = {
  invoke: <C extends ChannelName>(channel: C, payload: Request<C>): Promise<Response<C>> =>
    ipcRenderer.invoke(channel, payload),
};

contextBridge.exposeInMainWorld('pastecode', api);
```

### Eventos: lo que el main empuja

`invoke` sólo sabe responder preguntas del renderer. Hay tres cosas que el renderer no puede preguntar —la salida de un PTY, un archivo de settings que cambió en disco, los resultados de una búsqueda que llegan de a chorros— y para eso el contrato tiene un segundo mapa, espejo del primero. Ver [ADR-0013](./adr/0013-eventos-tipados-en-el-ipc.md).

```typescript
// packages/ipc-contract/src/events.ts
export interface IpcEvents {
  'terminal:data': { sessionId: string; chunk: string };
  'terminal:exit': { sessionId: string; exitCode: number | null; signal: string | null };
}

export type EventName = keyof IpcEvents;
export type EventPayload<E extends EventName> = IpcEvents[E];

// La misma lista, en runtime: el preload necesita algo contra qué comparar.
export const EVENT_NAMES = [
  'terminal:data',
  'terminal:exit',
] as const satisfies readonly EventName[];
```

El renderer se suscribe y recibe la función que corta la suscripción:

```typescript
useEffect(() => window.pastecode.subscribe('terminal:data', onData), [onData]);
```

Del lado del main, `emit` en `apps/desktop/src/main/ipc/emitter.ts` es a los eventos lo que `registerHandler` es a los canales: el único lugar donde se decide cómo viaja uno.

### Reglas de IPC

1. Nunca exponer `ipcRenderer` completo al renderer. Sólo los wrappers `invoke` y `subscribe` de arriba.
2. Todo handler del main valida su input con Zod antes de tocar nada. **El renderer no es de confianza.**
3. Toda ruta de archivo recibida por IPC se resuelve y se verifica que esté dentro del workspace abierto. Ver [RNF-11](./04-requerimientos-no-funcionales.md#seguridad) y [validación de rutas](./convenciones/seguridad.md#validación-de-rutas).
4. Los canales se nombran `dominio:acción` en camelCase. Los eventos también, y comparten el espacio de nombres: un nombre no puede ser canal y evento a la vez.
5. Al agregar un canal, se actualiza `packages/ipc-contract` **primero**. El contrato es la fuente de verdad. Vale igual para un evento, con la diferencia de que además hay que agregarlo a `EVENT_NAMES`, que es lo que existe en runtime.
6. **Los eventos van del main al renderer y nunca al revés.** El renderer pide con `invoke`. No hay un `publish` en `PasteCodeApi` y no lo va a haber: un renderer que puede empujar mensajes al main es un renderer que puede llamar a cualquier handler sin pasar por la validación del canal. Si el renderer necesita avisar algo, es un canal, con su schema.

---

[← Visión y alcance](./01-vision-y-alcance.md) · [Índice](./README.md) · [Siguiente: Requerimientos funcionales →](./03-requerimientos-funcionales.md)
