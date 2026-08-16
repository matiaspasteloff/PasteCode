# ADR-0007: Buscar en el workspace con ripgrep como binario externo, no con worker threads

## Estado

`Aceptado`

**Fecha:** 2026-08-15

## Contexto

[RF-201](../03-requerimientos-funcionales.md#búsqueda-en-workspace) no pide "buscar texto": pide **los primeros 100 matches en menos de un segundo sobre un repositorio de 50.000 archivos**. Ese número es el requerimiento entero, y es lo que descarta la mitad de las soluciones antes de empezar.

Buscar en 50.000 archivos desde Node significa recorrer el árbol de directorios, abrir cada archivo, leerlo y correr una expresión regular sobre su contenido. Nada de eso es difícil; todo eso es lento. El costo no está en el algoritmo de búsqueda sino en el I/O y en la cantidad de cruces entre JavaScript y el sistema operativo, y ninguna de las dos cosas mejora escribiendo mejor JavaScript.

Hay además dos restricciones del proyecto encima:

- **[RNF-05](../04-requerimientos-no-funcionales.md#performance)**: el instalador no puede pasar de 120MB.
- **El renderer no puede tocar el disco** ([regla arquitectónica](../02-arquitectura.md#modelo-de-procesos)), así que la búsqueda vive en el main sí o sí, y el main es **un solo hilo** que además atiende todo el IPC. Una búsqueda que bloquee ese hilo congela la aplicación entera.

## Decisión

**ripgrep como proceso externo, distribuido con `@vscode/ripgrep` y consumido por su salida `--json`.**

Es un proceso aparte, así que el main no se bloquea: lo único que hace es leer un stream y traducir líneas. Los resultados se emiten **mientras ripgrep sigue buscando**, en lotes, por el `search:result` de [ADR-0013](./0013-eventos-tipados-en-el-ipc.md). Eso es lo que hace alcanzable el segundo de RF-201: no hay que terminar de buscar para mostrar los primeros cien.

`@vscode/ripgrep@1.18.0` distribuye los binarios como **`optionalDependencies` por plataforma** —`@vscode/ripgrep-win32-x64` y once más—, exactamente el mismo modelo que [ADR-0014](./0014-node-pty-con-binarios-precompilados.md) eligió para node-pty. No hay `postinstall`, no hay descarga en tiempo de instalación, y sólo se baja el binario de la plataforma que se está usando.

Tres decisiones que van con ésta:

**El binario nunca se resuelve por `PATH`.** `rgPath` sale de un `require.resolve`, y en el build empaquetado se traduce de `app.asar` a `app.asar.unpacked`, porque un ejecutable adentro de un asar no se puede lanzar. Ver [seguridad.md](../convenciones/seguridad.md#el-ejecutable-nunca-se-resuelve-por-path).

**Los argumentos van como array y con `shell: false`.** El patrón lo escribe una persona y puede tener comillas, espacios o `&&`. `buildRipgrepArgs` es puro y está en `packages/core` justamente para que se pueda testear exactamente qué se le pasa al proceso.

**Las exclusiones salen de `files.exclude`.** El schema de settings **no tiene** una sección `search.*` y [RF-005](../03-requerimientos-funcionales.md#gestión-de-workspace-y-archivos) dice que ésa es la clave configurable. Dos fuentes para lo mismo serían dos formas de que el árbol y la búsqueda muestren cosas distintas.

## Alternativas consideradas

| Opción                                          | Pros                                                                                                                                              | Contras                                                                                                                                                                                                                                       | Por qué no                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Worker threads con código propio**            | Cero binarios externos. Cero bytes en el instalador. Control total sobre el matching y sobre cómo se reportan los resultados                      | Hay que escribir el recorrido, el matcher de globs, la detección de binarios, la de encoding y el paralelismo. Y aun bien hecho no se acerca: ripgrep usa un autómata de Aho-Corasick, `memchr` vectorizado y salta archivos por su contenido | Es un proyecto en sí mismo, compite con lo que este proyecto quiere demostrar, y el resultado sería más lento |
| **Búsqueda sincrónica en el main, sin hilos**   | Lo más simple de escribir                                                                                                                         | Congela el IPC entero mientras busca. Con 50.000 archivos la aplicación deja de responder por segundos                                                                                                                                        | Rompe la aplicación, no sólo la búsqueda                                                                      |
| **`git grep`**                                  | Ya está instalado en la máquina de cualquiera que programe, y es rápido                                                                           | Sólo funciona adentro de un repositorio Git y sólo ve archivos rastreados. Un workspace sin `git init`, o con archivos nuevos sin agregar, no se puede buscar                                                                                 | La búsqueda no puede depender de que el workspace sea un repositorio                                          |
| **`@vscode/ripgrep` viejo (con `postinstall`)** | Es lo que usaba VS Code históricamente                                                                                                            | Bajaba el binario de GitHub en un `postinstall`. `pnpm-workspace.yaml` bloquea los scripts de instalación a propósito, y un install sin red dejaría de funcionar                                                                              | La 1.18.0 ya no lo hace: distribuye por `optionalDependencies`, que es lo que este ADR elige                  |
| **Elegida: ripgrep externo con `--json`** ✅    | El main no se bloquea. Los resultados se muestran mientras busca. Respeta `.gitignore` y detecta binarios sin código nuestro. Instalación sin red | 5,2MB más en el instalador. Un binario de terceros más que auditar, y un formato de salida que puede cambiar entre versiones                                                                                                                  | —                                                                                                             |

## Consecuencias

- ✅ El hilo del main no se bloquea: lee un stream y traduce líneas.
- ✅ Los resultados aparecen mientras la búsqueda corre, que es lo único que hace alcanzable el presupuesto de RF-201.
- ✅ Cancelar es matar un proceso. Con worker threads habría que propagar una señal de cancelación por todo el recorrido y esperar a que cada hilo la mire.
- ✅ La detección de archivos binarios, el respeto por `.gitignore` y el manejo de encodings vienen gratis y bien hechos.
- ⚠️ **5,2MB más en el instalador.** Con el asar bajado a 5,49MB en el PR de la terminal, el margen contra los 120MB de RNF-05 alcanza de sobra; se mide en cada build igual.
- ⚠️ **El formato `--json` es un contrato con un binario que se actualiza solo.** Por eso `parseRipgrepLine` verifica la forma campo por campo en vez de asumirla: si una versión futura la cambia, el resultado es que no aparecen matches, no que la aplicación rompa.
- ⚠️ Un match por línea, no por ocurrencia: una línea con tres coincidencias es un resultado. El panel muestra líneas, y tres entradas idénticas con distinta columna es ruido.
- ❌ Se cierra la puerta a buscar adentro de archivos que no están en el disco —un buffer con cambios sin guardar no se busca—. Es la misma limitación que tiene VS Code y por la misma razón.
