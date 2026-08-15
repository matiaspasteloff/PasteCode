# ADR-0003: Extension host en un proceso separado

## Estado

✅ **Aceptado** — 2026-08-14

## Contexto

Las extensiones son código de terceros que corre dentro de nuestra aplicación. Hay tres lugares posibles donde ejecutarlas:

- **En el renderer:** una extensión con un loop infinito congela toda la UI.
- **En el main:** una extensión que crashea tumba la aplicación entera y puede acceder a todo el sistema.
- **En un proceso propio:** aislamiento real, al costo de latencia de IPC.

Este es el punto donde un IDE deja de ser un editor de texto, y es el que más peso tiene como demostración de arquitectura.

## Decisión

Las extensiones corren en un **proceso Node aislado**, lanzado con `utilityProcess.fork()` de Electron, comunicándose con el main vía `MessagePort` con un protocolo RPC tipado.

## Alternativas consideradas

| Opción                          | Pros                                                                                            | Contras                                                                                                                     | Por qué no                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **En el renderer (Web Worker)** | Sin latencia de IPC hacia la UI, sandbox del navegador gratis                                   | Sin acceso a Node (muchas extensiones lo necesitan); un worker bloqueado igual afecta el hilo principal al postear mensajes | Limita demasiado lo que una extensión puede hacer                      |
| **En el main**                  | Implementación trivial, acceso directo a todo                                                   | Un crash tumba la app; sin límite de recursos; superficie de ataque enorme                                                  | Inaceptable para código de terceros                                    |
| **`child_process.fork()`**      | Aislamiento real                                                                                | Más pesado que `utilityProcess`, sin integración con el ciclo de vida de Electron                                           | `utilityProcess` es la primitiva pensada para esto en Electron moderno |
| **`utilityProcess.fork()`** ✅  | Aislamiento real, acceso a Node, ciclo de vida gestionado por Electron, `MessagePort` eficiente | Latencia de IPC en cada llamada; toda la API debe ser async y serializable                                                  | —                                                                      |

## Consecuencias

- ✅ Una extensión que crashea no tumba el IDE; se reinicia el host y se notifica al usuario. Satisface [RF-907](../03-requerimientos-funcionales.md#sistema-de-extensiones).
- ✅ Se puede imponer timeout (5s) a las llamadas de extensiones.
- ✅ Se puede medir el consumo de recursos por extensión y reportarlo.
- ⚠️ Toda la API de extensiones debe ser **asíncrona y serializable**. No se pueden pasar objetos con métodos por el límite del proceso. Esto condiciona el diseño de `packages/extension-api` desde el día 1.
- ⚠️ Agrega latencia de IPC a cada llamada. Se mitiga con batching de eventos ([RNF-03](../04-requerimientos-no-funcionales.md#performance)).
- ❌ Se descarta la posibilidad de que una extensión manipule directamente el DOM del editor. Todo pasa por la API.
