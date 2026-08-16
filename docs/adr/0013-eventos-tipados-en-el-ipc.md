# ADR-0013: Agregar eventos tipados del main al renderer, sobre `ipcRenderer.on`

## Estado

`Aceptado`

**Fecha:** 2026-08-15

## Contexto

Hasta la Etapa 2, `PasteCodeApi` expone un solo primitivo: `invoke`. Alcanzaba porque todo lo que el renderer necesitaba era una respuesta a una pregunta suya —leé este archivo, listá esta carpeta, abrí este workspace—. Request/response modela eso perfectamente y [ADR-0011](./0011-resultado-tipado-en-el-limite-de-ipc.md) le dio la forma de error que le faltaba.

La Etapa 3 rompe esa simetría tres veces, y ninguna es negociable:

- **La terminal** ([RF-301 a RF-305](../03-requerimientos-funcionales.md#terminal-integrada)). Un PTY escupe bytes cuando quiere. El renderer no puede preguntar "¿hay salida?" sesenta veces por segundo: sería polling contra un proceso que la mayoría del tiempo no tiene nada, y con `tail -f` de un log estaría siempre tarde.
- **Las settings** ([RF-704, RF-705](../03-requerimientos-funcionales.md#comandos-atajos-y-configuración)). La recarga en caliente empieza con un `fs.watch` en el main. El renderer no sabe que el archivo cambió y no tiene forma de enterarse preguntando.
- **La búsqueda** ([RF-201](../03-requerimientos-funcionales.md#búsqueda-en-workspace)). El criterio pide los primeros 100 resultados en menos de un segundo sobre 50.000 archivos. Eso obliga a mostrar resultados **mientras** ripgrep sigue buscando, no cuando termina. Una respuesta única llega, por definición, tarde.

El momento importa por la misma razón que en ADR-0011: el LSP y el DAP de las Etapas 4 y 5 son, casi enteros, tráfico empujado desde el main —diagnósticos, eventos de stop, salida del programa debugueado—. El primitivo que se elija acá lo van a heredar. Y hay una fuerza de seguridad que no existía en `invoke`: suscribirse a un canal significa **nombrar un canal**, y el renderer no es de confianza. `ipcRenderer.on` acepta cualquier string, incluidos los canales internos de Electron.

## Decisión

**Un segundo primitivo, `subscribe`, tipado por un mapa `IpcEvents` espejo de `IpcChannels`, sobre `ipcRenderer.on`, con una allow-list de nombres que existe en runtime.**

```typescript
// packages/ipc-contract/src/events.ts
export interface IpcEvents {
  'terminal:data': TerminalDataEvent;
  'terminal:exit': TerminalExitEvent;
}

export type EventName = keyof IpcEvents;
export type EventPayload<E extends EventName> = IpcEvents[E];

export const EVENT_NAMES = [
  'terminal:data',
  'terminal:exit',
] as const satisfies readonly EventName[];
```

```typescript
// packages/ipc-contract/src/api.ts
subscribe<E extends EventName>(event: E, listener: (payload: EventPayload<E>) => void): () => void;
```

Cuatro decisiones dentro de la decisión, que son lo que este ADR realmente registra:

**`EVENT_NAMES` existe en runtime.** Los tipos se borran al compilar. Sin una lista de verdad, el preload no tiene contra qué comparar y `subscribe('ELECTRON_BROWSER_REQUIRE', ...)` funciona. La allow-list es lo que hace que `subscribe` sea tan acotado como `invoke`, donde el main valida el canal del otro lado.

**El listener nunca ve el `IpcRendererEvent`.** El preload envuelve el listener y le pasa sólo el payload. Ese objeto trae `sender`, `senderFrame` y `ports`: entregarlo sería devolver por la ventana la superficie de Electron que el contextBridge saca por la puerta.

**`subscribe` devuelve el unsubscribe, y no hay `off`.** Un `off(event, listener)` obligaría al llamador a conservar la referencia exacta, que no es la que se registró —está envuelta—, así que el preload tendría que mantener un mapa de equivalencias y fallar en silencio cuando no la encuentra. La clausura no puede equivocarse de listener.

**Los eventos no llevan schema Zod.** [La regla 2 de IPC](../02-arquitectura.md#reglas-de-ipc) exige validar todo request porque el emisor es el renderer. Acá el emisor es el main: validar sería validar código propio, una vez por chunk de terminal. Lo que sí se valida es el **nombre**, porque ése sí lo elige el renderer.

## Alternativas consideradas

| Opción                                            | Pros                                                                                                                                                                          | Contras                                                                                                                                                                                                                                                            | Por qué no                                                                                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Polling con `invoke`**                          | Cero primitivos nuevos; el contrato no cambia                                                                                                                                 | Un `terminal:read` cada 16ms devuelve vacío la mayoría de las veces y aun así paga el costo de un salto de proceso. La latencia de la terminal pasa a ser el intervalo del poll, y [RNF-02](../04-requerimientos-no-funcionales.md#performance) pide menos de 16ms | Convierte un problema resuelto por el SO —hay datos, avisá— en uno de elegir un intervalo, y no hay intervalo bueno                             |
| **`MessagePort` por sesión de terminal**          | Es lo que hace VS Code. Canal dedicado, menor overhead por chunk, y el backpressure es del puerto y no del bus de IPC                                                         | Una **segunda** forma de comunicarse en paralelo al `invoke`: dos ciclos de vida, dos formas de cerrar, dos lugares donde mirar cuando algo no llega. Y el puerto hay que entregarlo igual por un canal, con lo cual no reemplaza a `subscribe`: lo suma           | El costo es arquitectónico y el beneficio es de performance que todavía no medimos. Queda disponible si el PR 7 muestra que el bus es el cuello |
| **`ipcRenderer.on` crudo expuesto al renderer**   | Nada que escribir                                                                                                                                                             | Entrega `on`, `off`, `send` y cualquier nombre de canal, incluidos los internos de Electron. Es exactamente lo que [la regla 1 de IPC](../02-arquitectura.md#reglas-de-ipc) prohíbe                                                                                | Rompe el contextBridge                                                                                                                          |
| **Elegida: `subscribe` tipado con allow-list** ✅ | Un solo mecanismo de push para terminal, settings, búsqueda, LSP y DAP. El renderer no puede nombrar un canal que no esté en el contrato. El tipo del payload sale del nombre | Todo evento nuevo se toca en tres archivos: `IpcEvents`, `EVENT_NAMES` y el emisor                                                                                                                                                                                 | —                                                                                                                                               |

## Consecuencias

- ✅ El payload de un listener sale del nombre del evento. Escuchar `terminal:exit` y leer `payload.chunk` no compila.
- ✅ Hay **un solo lugar** donde se decide cómo viaja un evento —`emit` en `main/ipc/emitter.ts`—, igual que `registerHandler` lo es para el request/response. Ahí vive la decisión de ignorar las ventanas ya destruidas, que si no habría que recordar en cada emisor.
- ✅ El renderer no puede suscribirse a un canal que no esté en el contrato, ni siquiera si alguien inyecta código en él.
- ⚠️ Un evento nuevo se agrega en **tres** lugares. El de `EVENT_NAMES` es el que se olvida, y olvidarlo falla en runtime y no al compilar; por eso hay un test de tipos en `emitter.test.ts` que compara `EVENT_NAMES` contra `EventName` y falla si falta alguno.
- ⚠️ Los eventos no tienen `IpcResult`. Un evento no es una pregunta que pueda fallar: lo que salió mal viaja como un campo del payload —`terminal:exit` lleva su `exitCode`—, no como un error de haberse suscripto.
- ⚠️ Cada evento se declara en el PR que lo emite, no todos por adelantado. `settings:changed`, `search:result` y `search:done` no están en esta lista todavía: sus payloads son decisiones de los PRs que los implementan, y adivinarlos acá sería fijar un contrato sobre features que no existen.
- ❌ Se cierra, por ahora, la puerta a un canal dedicado por sesión de terminal. Si el bus de IPC resulta ser el cuello de botella, el reemplazo es `MessagePort` y este ADR se reemplaza con la medición que lo justifique.
