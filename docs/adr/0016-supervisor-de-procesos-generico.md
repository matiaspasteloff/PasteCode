# ADR-0016: Un supervisor de procesos genérico sobre un handle mínimo, en vez de una clase por tipo de proceso

## Estado

`Aceptado`

**Fecha:** 2026-08-16

## Contexto

El [paso 26](../00-guia-paso-a-paso.md#etapa-4--inteligencia-de-lenguaje-y-git) pide generalizar el supervisor de procesos antes de tocar LSP: _"extraé lo que aprendiste con el PTY a un supervisor reutilizable: spawn, health check, reinicio con backoff, límite de 3 intentos, logging"_. La Etapa 3 dejó un supervisor de PTY que funciona y está testeado, y la Etapa 4 agrega servidores de lenguaje. La Etapa 5 agrega el extension host y el adaptador de debug.

El error fácil acá es escribir **una** clase `Supervisor` que sirva para todo, porque de lejos los tres casos se parecen: todos lanzan un proceso hijo, todos lo matan al cerrar y todos quieren un log. De cerca no se parecen en nada:

- El PTY es un **pool de N procesos donde salir es normal**. La persona abre tres terminales, escribe `exit` en una y esa sesión desaparece. Reintentar sería absurdo.
- El servidor de lenguaje es **un proceso que tiene que estar vivo, y cuya salida es una falla**. Si se cae, hay que relanzarlo con backoff hasta tres veces, que es lo que pide [RNF-09](../04-requerimientos-no-funcionales.md#confiabilidad).

Una sola clase para los dos produce un objeto donde la mitad de los métodos son inaplicables en cada uso —`restart()` en una terminal, `list()` en un servidor— y donde cada método arranca con un `if` sobre un modo.

Hay además una segunda diferencia, más concreta: **el mecanismo de proceso no es el mismo**. Un PTY es `@lydell/node-pty`, habla por una pseudo-terminal, mezcla salida y eco en un solo canal y en Windows no acepta señales. Un servidor de lenguaje es `node:child_process` con tres pipes, y `vscode-jsonrpc` necesita el `Readable` y el `Writable` por separado.

Y una tercera, que apareció al mirar el apagado: `main/index.ts` disponía **sólo** las terminales en su `before-quit`. Cerrar PasteCode en medio de una búsqueda dejaba el proceso de ripgrep vivo y adoptado por el sistema. Es una violación real de [RNF-10](../04-requerimientos-no-funcionales.md#confiabilidad) que nadie había notado porque `rg` suele ganar la carrera y terminar solo antes de que se note.

## Decisión

**Tres capas y un handle mínimo, no una clase.**

```
packages/core/src/process/restart-policy.ts   ← pura: backoff, límite, "estuvo sano"
apps/desktop/src/main/supervisors/
  process-handle.ts      ← pid, terminate, forceKill, onExit. Nada más
  managed-process.ts     ← UN proceso: spawn, apagado en dos fases, log
  process-pool.ts        ← N managed, disposeAll con UNA ventana de gracia
  supervised-process.ts  ← UN managed + backoff + health check pasivo
  adapters/{pty-handle,child-handle}.ts
  pty.ts                 ← ahora: el pool más lo que es específico de un PTY
```

`ProcessHandle` es deliberadamente pobre: no tiene `write`, no tiene `onData` y no tiene streams. Eso es específico de para qué se lanzó el proceso, y ponerlo en la interfaz común obligaría a cada adaptador a inventar una versión de algo que no tiene. Cada adaptador **extiende** el handle con lo suyo: `PtyHandle` agrega `write`, `resize` y `onData`; `ChildProcessHandle` agrega `stdin` y `stdout`.

`ManagedProcessConfig.requestGracefulExit` es la costura que hace que esto no sea una envoltura de `kill`: un servidor de lenguaje matado con `SIGTERM` deja huérfano al `tsserver` que él mismo lanzó, y el `shutdown`/`exit` del protocolo es la única forma de que limpie a sus hijos. Un PTY no define ese campo.

El apagado va partido en **dos métodos** (`requestStop` y `forceKill`) y no en un `stop()` monolítico, para que el pool pueda pedirle a todos sus procesos que terminen y **después** abrir una sola ventana de gracia compartida. Y el registro de disposers de `services/shutdown.ts` extiende la misma idea a toda la app: una ventana de tres segundos para todos los subsistemas, no una cada uno.

## Alternativas consideradas

| Opción                                                  | Pros                                                                                                                | Contras                                                                                                                                                                                                               | Por qué no                                                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Una clase `Supervisor` con un modo**                  | Un solo archivo, un solo test, una sola cosa que aprender                                                           | La mitad de los métodos son inaplicables en cada uso, y cada método arranca con un `if` sobre el modo. Un `restart()` en una terminal y un `list()` en un servidor de lenguaje no son features, son superficie muerta | Es la abstracción equivocada: los dos casos comparten el ciclo de vida de **un** proceso, no la forma de administrarlos           |
| **Dejar `pty.ts` como está y escribir `lsp.ts` aparte** | Cero riesgo de regresión en la terminal, que ya anda                                                                | Duplica el apagado en dos fases, el log y la contabilidad de procesos vivos. Con el DAP y el extension host serían cuatro copias, y las copias divergen                                                               | El paso 26 existe exactamente para no hacer esto, y la guía dice que es más barato ahora que nunca                                |
| **Una librería de supervisión de procesos**             | No escribimos nada                                                                                                  | Las que hay (`forever`, `pm2`) supervisan procesos de servidor desde una CLI, con reinicio por archivo de configuración y persistencia. Traer eso a un proceso de Electron es traer un gestor de servicios entero     | El problema es de 200 líneas y necesita `requestGracefulExit`, que ninguna expone porque ninguna sabe de protocolos de aplicación |
| **Elegida: tres capas sobre un handle mínimo** ✅       | Cada capa se testea sola. La política de reinicio queda pura en `core`. Agregar el DAP es un adaptador, no una capa | Son cinco archivos donde había uno, y hay que saber cuál usar. `ProcessPool` y `SupervisedProcess` no comparten nada salvo `ManagedProcess`, que es exactamente lo que la decisión afirma                             | —                                                                                                                                 |

## Consecuencias

- ✅ **`pty.test.ts` pasa sin tocar una sola línea.** Ese fue el criterio de aceptación del refactor: si hubiera habido que cambiar un test, el refactor habría cambiado comportamiento y estaría mal.
- ✅ La política de reinicio es una función pura en `packages/core`, así que "a los tres intentos se rinde" y "una corrida sana borra el contador" se testean sin lanzar nada ni esperar segundos de reloj.
- ✅ **Se cierra la fuga de ripgrep.** El registro de disposers hace que agregar un subsistema con procesos hijo sea registrar una función, no acordarse de agregar una línea a `before-quit`. Era el mecanismo que había dejado a `rg` afuera.
- ✅ El apagado cuesta el **máximo** de las esperas y no la suma. Tres subsistemas con tres ventanas de tres segundos son nueve segundos entre el click en la X y la ventana desapareciendo, que alcanza de sobra para que Windows dibuje el diálogo de "el programa no responde" encima de una app que está cerrando perfectamente bien.
- ⚠️ Son cinco archivos donde había uno, y hay que saber cuál usar. La regla es corta: **si salir es normal, `ProcessPool`; si salir es una falla, `SupervisedProcess`.**
- ⚠️ El log de ciclo de vida sale por `console.warn`, que es lo único que `no-console` permite además de `error`. En un `.exe` empaquetado eso va al `stderr` que casi nadie mira. Es aceptable mientras el log sea de diagnóstico; el día que haya que persistirlo, el punto de entrada ya está en un solo lugar.
- ❌ Se cierra la puerta a un handle que unifique PTY y pipes bajo una sola forma de leer. No es una pérdida: la diferencia entre un canal con secuencias de control y dos streams separados es real, y esconderla detrás de un campo opcional sólo la mueve al lugar donde molesta.
