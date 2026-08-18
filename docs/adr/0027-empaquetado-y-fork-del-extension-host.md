# ADR-0027: Empaquetar el extension host como un segundo entry del main

## Estado

`Aceptado`

**Fecha:** 2026-08-17

## Contexto

La Etapa 5 mete un cuarto proceso: el extension host, donde va a correr código de terceros aislado del main y del renderer ([ADR-0003](./0003-extension-host-aislado.md)). Antes de escribir el protocolo, la supervisión y el loader hacía falta contestar una pregunta que no se puede razonar desde el escritorio: **¿de dónde sale el archivo que se forkea, y se puede leer desde adentro del `.asar`?**

El riesgo es exactamente el del paso 14 de la Etapa 2, cuando los web workers de Monaco no se pudieron construir bajo `file://` y hubo que servir el renderer desde un esquema propio ([ADR-0012](./0012-servir-el-renderer-desde-un-protocolo-propio.md)). Adentro del asar no hay archivos: hay offsets en un contenedor, y sólo las APIs de Electron parcheadas para entenderlo pueden leerlos. Si `utilityProcess.fork` no fuera una de ésas, el bundle del host tendría que salir a `resources/` con su propia entrada en `files` y en `asarUnpack`, como ya viajan ripgrep, node-pty y el `typescript-language-server`.

La segunda mitad de la pregunta es de build: `electron.vite.config.ts` tiene tres secciones —`main`, `preload`, `renderer`— y el host no es ninguna de las tres, aunque se parezca mucho a la primera.

## Decisión

**El host es un segundo entry de tipo `main` en `electron.vite.config.ts`, sale a `out/main/extension-host.js`, viaja adentro del `.asar` con el resto del main, y se forkea con `utilityProcess.fork` resolviendo la ruta contra `__dirname`.**

## Alternativas consideradas

| Opción                                     | Pros                                                                                                                                                                | Contras                                                                                                                                                                  | Por qué no                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Bundle afuera, en `resources/`**         | Sin dudas sobre el asar; es el camino que ya usan los binarios externos                                                                                             | Una entrada más en `files` y otra en `asarUnpack`; una ruta distinta en desarrollo y en producción; un archivo del proyecto tratado como si fuera un binario de terceros | El spike mostró que no hace falta. Es complejidad para un problema que no existe                                                    |
| **`child_process.fork` de Node**           | API conocida; no depende de Electron                                                                                                                                | Para `child_process` el asar es un archivo binario cualquiera, así que obliga a la opción anterior; y el canal es el IPC de Node, no un `MessagePort`                    | Cierra la puerta a pasar `MessagePort`s, que es como el host va a hablar con el renderer sin pasar por el main en el futuro         |
| **Un cuarto tipo de sección en el config** | Separaría conceptualmente al host del main                                                                                                                          | `electron-vite` no lo tiene, así que sería un `build` a mano en paralelo                                                                                                 | Inventar una sección para expresar una diferencia que al bundler no le importa: los dos son código de Node que no pasa por Chromium |
| **Segundo entry de `main`** ✅             | Un solo `rollupOptions.input` con dos claves; mismos externals y mismo target; entra al asar sin tocar `electron-builder.yml`; la ruta es la misma empaquetado o no | El host queda en `out/main/`, que sugiere que es parte del main cuando es otro proceso                                                                                   | —                                                                                                                                   |

## Lo que midió el spike

Una app **empaquetada** que forkea el host y recibe su `pong`, verificada en `e2e/tests/extension-host-spike.spec.ts` contra el `.exe` de `release/win-unpacked`, no contra `out/`.

Dos hallazgos que valen más que la respuesta:

1. **`utilityProcess.fork` sí resuelve un módulo de adentro del asar.** La respuesta era la buena, y el bundle del host no necesita salir a `resources/`.

2. **El canal del lado del host es `process.parentPort` de Electron, no el `parentPort` de `node:worker_threads`.** Los dos se llaman igual y no son lo mismo: el de `worker_threads` sirve dentro de un _hilo_, y un `utilityProcess` es un _proceso_, así que ahí vale `null`. El host quedaba mudo sin lanzar ningún error. Y no fallaba sólo empaquetado: fallaba igual en desarrollo, lo que confirma que el spike valía por el handshake y no sólo por el asar. El listener recibe además un `MessageEvent`, así que el payload viene en `.data` y no pelado.

Un tercer detalle, del lado de la observación: un Electron empaquetado en Windows es un binario del subsistema GUI y **no tiene stdout**, así que un `console.warn` en el main es indistinguible de que el fork haya fallado. El spike escribe su resultado a un archivo cuya ruta llega por `PASTECODE_SPIKE_REPORT`. Deliberadamente **no** se reusó `dataDirectoryOverride`: ése vale `undefined` cuando `app.isPackaged`, que es el guard que impide forzarle el directorio de datos al `.exe` distribuido, y debilitarlo para poder medir habría sido medir otra cosa.

## Consecuencias

- ✅ Agregar el host no toca `electron-builder.yml`: ni `files`, ni `asarUnpack`, ni una ruta condicional por entorno.
- ✅ La ruta del bundle es `join(__dirname, 'extension-host.js')` en los tres escenarios —`pnpm dev`, el E2E sobre `out/`, y el `.asar`—, porque los dos entries salen al mismo directorio.
- ✅ El `.exe` no crece por esto: el host bundleado son 0,5KB, y RNF-05 no se mueve.
- ⚠️ El host queda en `out/main/`, que sugiere pertenencia al main cuando es otro proceso. Se compensa con que su código fuente vive en `src/extension-host/`, bien lejos de `src/main/`.
- ⚠️ El host se compila con los mismos externals que el main. El día que necesite uno distinto —una dependencia que sólo él use— hay que partir la configuración.
- ❌ Queda descartado tratar al host como un binario externo. Si alguna vez tiene que distribuirse aparte de la app —una versión del host por versión de la API de extensiones, por ejemplo—, esta decisión se revisa entera.
