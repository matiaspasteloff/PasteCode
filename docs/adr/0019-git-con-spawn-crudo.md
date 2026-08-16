# ADR-0019: Resolver `git` a una ruta absoluta al arrancar y lanzarlo con `spawn` crudo, en vez de `simple-git`

## Estado

`Aceptado`

**Fecha:** 2026-08-16

## Contexto

El [paso 29](../00-guia-paso-a-paso.md#etapa-4--inteligencia-de-lenguaje-y-git) pide la integración con Git: estado del repositorio ([RF-601](../03-requerimientos-funcionales.md)), stage y unstage (RF-602), commit (RF-603), ramas (RF-604), decoraciones de gutter (RF-605) y badges en el árbol (RF-606).

Hay una tensión de entrada, y es la que este ADR existe para resolver:

- **[seguridad.md](../convenciones/seguridad.md#el-ejecutable-nunca-se-resuelve-por-path) prohíbe resolver ejecutables por `PATH`.** La regla es buena y tiene una razón concreta: el `PATH` de una sesión de desarrollo lo escriben herramientas, no personas, y un repositorio clonado puede dejar un ejecutable con un nombre conocido en un directorio que participe de la búsqueda.
- **`git` es, precisamente, una herramienta del `PATH`.** No se puede empaquetar: son decenas de megabytes contra los 22,3MB de margen de [RNF-05](../04-requerimientos-no-funcionales.md#recursos), y aunque cupiera, hay que usar la instalación del sistema porque es la que tiene el `credential.helper`, el `user.email`, el `core.autocrlf` y los hooks de la persona.

La otra decisión es si usar un envoltorio. `simple-git` es la opción obvia: 1,5MB, mantenido, API cómoda.

## Decisión

**`spawn` crudo con `shell: false`, argumentos armados por funciones puras en `packages/core/src/git/`, y el ejecutable resuelto a una ruta absoluta una sola vez al arrancar.**

La resolución, en orden:

1. `git.path` de las settings, si está. Pasa por `assertExecutable` como cualquier otra ruta.
2. Los **directorios de instalación conocidos** de la plataforma: `%ProgramFiles%\Git\cmd` y compañía en Windows, `/usr/bin`, `/usr/local/bin`, `/opt/homebrew/bin` en POSIX.
3. El `PATH`, **sólo como fuente de directorios**: con cada uno se construye una ruta absoluta que después pasa por `assertExecutable`.

Se rechaza cualquier candidato que caiga **adentro de la raíz del workspace**. Lo que llega a `spawn` es siempre absoluto, siempre verificado, y **resuelto una vez y nunca re-resuelto**.

`seguridad.md` gana una subsección con esto: **la regla se enmienda, no se viola.**

## Alternativas consideradas

| Opción                                       | Pros                                                                             | Contras                                                                                                                                                                         | Por qué no                                                                                                                                                                    |
| -------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`simple-git`**                             | API cómoda, tipada, con parsers de status y diff ya escritos                     | Lanza `git` **por nombre** y deja que el sistema operativo lo busque en el `PATH` en el momento de cada llamada                                                                 | **No resuelve el problema del `PATH`: lo esconde.** Es exactamente lo que `seguridad.md` prohíbe, y encima queda adentro de una librería donde no se puede auditar ni cambiar |
| **Empaquetar `git`**                         | Cero dependencias del sistema; versión conocida                                  | Decenas de MB contra 22,3MB de margen. Y quedaría sin el `credential.helper` ni la config del usuario, así que cualquier `push` pediría credenciales que no tiene dónde guardar | El presupuesto y, sobre todo, que sería un `git` peor que el que la persona ya tiene instalado                                                                                |
| **Usar `--porcelain` (v1)**                  | Formato más compacto y más conocido                                              | v1 no trae el ahead/behind y escapa los nombres no ASCII con comillas y octales                                                                                                 | `--porcelain=v2 --branch -z` da los códigos **y** `# branch.ab +1 -2` en una sola invocación, y `-z` esquiva por completo las reglas de comillas de git                       |
| **`spawn` crudo + parsers puros en core** ✅ | Lo que se ejecuta es visible y auditable; los parsers se testean sin lanzar nada | Hay que escribir los parsers                                                                                                                                                    | —                                                                                                                                                                             |

## Consecuencias

- ✅ **Lo que se ejecuta está escrito acá.** Un array de argumentos, `shell: false`, `cwd` en la raíz del workspace, ruta absoluta. No hay una capa que decida cosas por su cuenta.
- ✅ **Los parsers son puros y viven en `packages/core/src/git/`.** Es además la mitigación del riesgo "un binario de terceros cambia de formato": `--porcelain=v2` es formato estable por contrato de git desde 2.11, y si algún día cambia, lo que hay que arreglar es una función con veinte tests y no un flujo con un proceso adentro. Es el mismo reparto que `buildRipgrepArgs` / `parseRipgrepLine`.
- ✅ **El mensaje de commit es un elemento de `argv`.** Un mensaje con comillas, saltos de línea o `$(...)` es un mensaje.
- ⚠️ **Hay que escribir los parsers.** Son ~120 líneas entre el de `--porcelain=v2` y el de las cabeceras `@@`, contra las cero de `simple-git`. Se paga una vez.
- ⚠️ **Los hooks corren.** Es lo que la gente espera de un commit hecho desde un IDE, y desactivarlos con `--no-verify` sería tomar una decisión que no nos corresponde. Se les pone un timeout de 30s y el error se muestra.
- ⚠️ **`git` anterior a 2.23 no tiene `restore`.** El unstage usa `git restore --staged` en vez de `git reset HEAD` porque el segundo falla en un repositorio sin commits, que es exactamente el estado en el que alguien desprepara un archivo por primera vez. La versión mínima queda anotada en el registro de riesgos.
- ❌ **No hay `push`, `pull` ni `merge`.** Están [fuera de alcance](../01-vision-y-alcance.md#alcance--fuera-out-of-scope) y necesitarían manejo de credenciales, que es un problema entero aparte.
- ❌ **La raíz del repositorio puede estar por encima de la del workspace** —abriste una subcarpeta— y eso queda como limitación documentada: todo corre con `cwd` en la raíz del workspace y se rechaza tocar archivos afuera, aunque pertenezcan al repositorio. [RNF-11](../04-requerimientos-no-funcionales.md#seguridad) queda intacto en vez de tener una excepción tallada.
