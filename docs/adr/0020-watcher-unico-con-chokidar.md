# ADR-0020: Un único watcher de archivos con chokidar, compartido por la recarga externa, el LSP y Git

## Estado

`Aceptado`

**Fecha:** 2026-08-16

## Contexto

[RF-004](../03-requerimientos-funcionales.md) —recargar un archivo que cambió fuera del editor— venía arrastrándose sin fase asignada desde la Etapa 2. Entra en la Etapa 4 y no más tarde porque deja de ser una feature suelta: **un watcher sirve a tres cosas a la vez**.

- La recarga externa (RF-004).
- `workspace/didChangeWatchedFiles` del LSP. Sin eso, un `git checkout` deja al servidor de TypeScript razonando sobre los archivos viejos, y los errores que muestra dejan de tener relación con lo que hay en el disco.
- El refresco del estado de Git. Es la respuesta completa a "refrescar Git sin hacer polling".

Tres subsistemas queriendo saber lo mismo, cada uno con su propio watcher, son tres recorridos del árbol y tres juegos de handles del sistema operativo sobre los mismos archivos.

Hay además una restricción que decide la implementación: el árbol de un proyecto real tiene `node_modules`, y eso son decenas de miles de archivos que a nadie le importan.

## Decisión

**`chokidar` v4, uno solo por workspace, con `ignored` alimentado por el matcher de exclusiones que ya existe.**

La decisión **no es de gusto de API sino de exclusiones**. `fs.watch({ recursive: true })` ya funciona en las tres plataformas y no necesita dependencia, pero **no filtra**: vigila `node_modules` entero. Eso son miles de handles en Windows y un chorro constante de eventos que se descartan. Y filtrar después no sirve, porque el costo está en establecer los watches, no en procesar los eventos.

chokidar v4 toma `ignored` como **función**, y `packages/core/src/workspace/exclusions.ts` ya exporta `createExclusionMatcher` construido para `files.exclude`. Con eso, [RF-005](../03-requerimientos-funcionales.md) aplica al watcher **gratis y con semántica idéntica** a la del árbol y la búsqueda: una sola definición de qué se ignora, en un solo lugar.

Dos capas de debounce, porque resuelven problemas distintos:

- `awaitWriteFinish` de chokidar espera a que **un** archivo deje de crecer. Un guardado atómico es un `rename` más cambios de tamaño — la misma ráfaga que `services/settings.ts` ya pelea a mano.
- Un trailing de 100ms encima coalesce **muchos** archivos, porque un `git checkout` toca miles.

Y un tope: más de 500 cambios en una descarga emite `{ changes: [], isBulk: true }`, y quien escucha revalida en bloque en vez de procesar miles de entradas en el hilo de UI ([RNF-06](../04-requerimientos-no-funcionales.md#performance)).

**La supresión de escrituras propias no es opcional.** `fs:writeFile` dispara el watcher, que emitiría un cambio para el archivo que la persona acaba de guardar: el renderer lo releería, y si quedó una tecla escrita entre medio, mostraría un diálogo de conflicto contra un cambio nuestro. `noteOwnWrite(path)` se llama **antes** de escribir, con un TTL de 5s — sin vencimiento, una marca huérfana se tragaría el próximo cambio externo de verdad, que es un bug peor que el que evita.

## Alternativas consideradas

| Opción                                                | Pros                                                                                                                  | Contras                                                                                                                                                                                | Por qué no                                                                                             |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **`node:fs.watch({ recursive: true })`**              | Cero dependencias. Ya funciona en las tres plataformas desde Node 20                                                  | **No filtra.** Vigila `node_modules`: miles de handles en Windows y un chorro de eventos que se tiran. Y los eventos son inconsistentes entre plataformas — en macOS llegan duplicados | El costo está en establecer los watches, así que filtrar después no lo evita                           |
| **Un watcher por subsistema**                         | Cada uno pide exactamente lo que necesita                                                                             | Tres recorridos del árbol y tres juegos de handles sobre los mismos archivos, y tres lugares donde acordarse de excluir `node_modules`                                                 | Es el problema que este ADR existe para no tener                                                       |
| **Polling con un intervalo**                          | Funciona en filesystems de red donde inotify miente                                                                   | Trabajo constante para nada el 99% del tiempo, y la latencia es el intervalo                                                                                                           | Queda igual como **red de seguridad opcional** en `git.refreshIntervalMs`, con `0` —nunca— por defecto |
| **Elegida: un chokidar con el matcher que ya hay** ✅ | Una definición de qué se ignora para el árbol, la búsqueda y el watcher. Los tres consumidores cuelgan de un callback | Una dependencia más. chokidar v4 sacó el soporte de globs, así que `ignored` **tiene** que ser una función — que resulta ser exactamente lo que nos sirve                              | —                                                                                                      |

## Consecuencias

- ✅ RF-004 se cierra, y con él una deuda que venía desde la Etapa 2 sin fase asignada.
- ✅ El LSP y Git no necesitan watcher propio: cuelgan del mismo callback. Es la mitad del valor de la decisión y la razón de que llegue **antes** que los dos.
- ✅ Las exclusiones son una sola definición. Cambiar `files.exclude` cambia el árbol, la búsqueda y el watcher a la vez.
- ✅ El arranque no paga nada: el watcher se levanta en `workspace:open` y **después del primer paint**, así que [RNF-01](../04-requerimientos-no-funcionales.md#performance) queda intacto.
- ⚠️ Una dependencia más en el bundle del main. La bundlea Vite, así que el impacto en [RNF-05](../04-requerimientos-no-funcionales.md#performance) es aproximadamente cero — no es un binario ni tiene módulos nativos.
- ⚠️ **`services/settings.ts` sigue usando `node:fs.watch` crudo y se queda así.** Vigila dos rutas fijas y conocidas; dos archivos no necesitan una librería. Unificarlo sería consistencia por consistencia.
- ⚠️ En filesystems de red el watcher puede no llegar nunca. Por eso existe `git.refreshIntervalMs`, en `0` por defecto.
- ❌ Se cierra la puerta a vigilar afuera de la raíz del workspace. Es deliberado: [RNF-11](../04-requerimientos-no-funcionales.md) contiene todo adentro de la raíz, y el watcher no es la excepción que valga la pena tallar.
