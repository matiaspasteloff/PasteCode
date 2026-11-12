# Etapa 10 — IDE II: Git, debug e IA

[← Etapa 9](./etapa-09-ide-lenguaje.md) · [Planes de ejecución](./README.md) · [Siguiente: cierre →](./etapa-11-cierre.md)

**Rama:** `claude/ide-exponential-improvements-mh7gtv-e10` · **PR contra:** `claude/ide-exponential-improvements-mh7gtv-e9`

## Objetivo

Lo que queda de los requerimientos `S` y `C` en los tres subsistemas que ya funcionan pero están cortos: Git sin diff ni sincronización (RF-607, RF-608), el debug sin breakpoints condicionales ni expresiones vigiladas (RF-506, RF-507), y el asistente que olvida la conversación al cerrar (RF-1009).

Son tres partes independientes. Si no entra todo, se cierra cada parte entera o no se empieza: la regla de oro.

## Leer antes

- [ADR-0019](../adr/0019-git-con-spawn-crudo.md): `main/git/run.ts`, `main/git/service.ts`, `packages/core/src/git/`.
- [ADR-0028](../adr/0028-adaptador-dap-externo-y-cliente-propio.md): `main/debug/`, `packages/core/src/debug/breakpoints.ts`, `renderer/features/debug/`.
- [ADR-0029](../adr/0029-asistente-de-ia-en-el-main.md) y [ADR-0032](../adr/0032-modos-del-asistente-y-edicion-directa.md): `renderer/stores/ai-store.ts`, `ai-edits.ts`, `main/ai/`.
- [ADR-0024](../adr/0024-cobertura-sin-la-capa-de-monaco.md): qué se excluye de cobertura y por qué.
- La confianza de workspace de la etapa 3: en modo restringido no hay Git ni debug.

---

## Parte A — Git

### T1 — Diff lado a lado (RF-607)

**De dónde sale el lado original.** Un canal nuevo, `git:getFileAtRevision`, que devuelve el contenido de un archivo en `HEAD` o en el índice. Los argumentos los arma una función nueva en `packages/core/src/git/args.ts`, con test, siguiendo a las que ya están. La revisión es una **lista cerrada** en el schema, no un texto libre: un nombre de revisión arbitrario llegado del renderer es un argumento de `git` que nadie validó. Con tope de tamaño, y detectando binarios.

**Dónde se muestra.** Las pestañas son rutas de archivo; una "pestaña de diff" obligaría a inventar otro tipo de pestaña en `core` y en la sesión. En cambio: **un modo de la pestaña del archivo**. El store del editor guarda, sin persistirlo, contra qué se está comparando ese archivo; `EditorArea` muestra el editor de diff de Monaco en vez del normal, con un encabezado que dice qué se compara y un botón para volver.

- El lado derecho es **el modelo real del archivo**: se puede editar, y guardar funciona como siempre.
- El lado izquierdo es un modelo de sólo lectura que se descarta al salir.
- Verificá en los tipos de Monaco cómo se crea el editor de diff, y que `monaco-setup.ts` cargue lo que necesita. Medí el instalador: RNF-05.
- Se abre con un click en un archivo del panel de Git.

### T2 — Pull, push y fetch (RF-608)

- `fetch`, `pull` y `push`, como comandos y como botones del panel. Argumentos en `core`, con tests.
- **`pull` es sólo avance rápido.** Un pull que necesita un merge abre un editor o deja conflictos, y resolver conflictos es RF-610, que no está. Si no se puede avanzar rápido, se dice y se sugiere la terminal.
- **`push` sin rama remota configurada** pregunta antes de crearla.
- **Autenticación.** Se usa el `git` y el gestor de credenciales de la persona; PasteCode no guarda ni pide contraseñas. Lo que hay que evitar es que `git` se quede esperando una contraseña en una terminal que no existe: verificá en la documentación de Git qué variable de entorno lo hace fallar en vez de preguntar, y ponela. El error que resulte tiene que decir qué hacer.
- **Progreso** (RNF-24): son operaciones de red. Una variante de `runGit` que entregue la salida a medida que llega, por un evento, y un canal para cancelar.
- Cuántos commits adelante y atrás, en la barra de estado. Mirá si el parser de estado ya lo lee antes de escribirlo de nuevo.

### T3 — Descartar cambios

- De un archivo con seguimiento: `git restore`. De uno sin seguimiento: a la papelera, con el `fs:delete` que ya existe.
- **Es destructivo y pide confirmación**, nombrando el archivo. RNF-07 dice que nunca se pierden datos del usuario: descartar un archivo con seguimiento no tiene vuelta atrás, y el diálogo lo dice con esas palabras.
- Si el archivo está abierto, la pestaña adopta el contenido restaurado.

**Las tres tareas respetan el modo restringido**: la compuerta de la etapa 3 está en un solo lugar, y los canales nuevos pasan por ahí.

---

## Parte B — Debug

### T4 — Breakpoints condicionales y logpoints (RF-506)

- `BreakpointSchema` suma tres campos opcionales: condición, condición por cantidad de pasadas, y mensaje de log. Es un schema estricto que se persiste en la sesión: verificá con un test que una sesión guardada **antes** de este cambio siga cargando.
- Viajan en `setBreakpoints`. Los nombres exactos de los campos y de las capabilities del adaptador salen de `@vscode/debugprotocol`.
- **Sólo se ofrece lo que el adaptador anuncia** en su respuesta de inicialización. Un adaptador sin logpoints no muestra la opción.
- La interfaz: click derecho sobre un breakpoint del margen abre un formulario chico para editarlo. Usá el menú contextual de la etapa 5.
- Un glifo distinto para cada tipo, con su token de color verificado por `check-contrast`.

### T5 — Expresiones vigiladas (RF-507)

- Una lista de expresiones, persistida en la sesión.
- Se evalúan cada vez que la ejecución se detiene, con el `debug:evaluate` que ya existe. Verificá qué contexto de evaluación define el protocolo para esto.
- Una sección nueva en el panel de debug: agregar, editar, quitar. El error de una expresión se muestra en su fila y no afecta a las demás.
- Sin sesión de debug activa, la lista se ve igual, sin valores.

`e2e/fixtures/dap-adapter.mjs` y `main/debug/fake-adapter.mjs` son los dobles: ampliarlos para que entiendan condiciones y respondan evaluaciones, sin cambiar lo que ya responden.

---

## Parte C — Asistente

### T6 — Persistir las conversaciones (RF-1009)

- El schema de una conversación guardada, en `packages/core`, con tests: mensajes, modo, modelo, y las tarjetas de llamadas a herramientas en una forma resumida.
- **Qué no se guarda:** los checkpoints con el contenido anterior de cada archivo —pueden pesar megabytes y ya no sirven después de cerrar— y, obviamente, la clave de API.
- Un servicio en el main que guarda por workspace en el directorio de datos del usuario, con escritura atómica. Con topes: cantidad de conversaciones por workspace y tamaño por conversación.
- Canales: listar, cargar, guardar y borrar. Identificadores opacos, nunca rutas.
- En el panel: conversación nueva, un historial para volver a una anterior, y borrar.

**Es código del usuario escrito en disco sin cifrar**, en su propio directorio de datos. Tres consecuencias:

- Una setting `ai.persistConversations`, sólo de usuario. Con qué valor por omisión se decide en el PR; lo que no se discute es que apagarla **borra lo guardado**, no sólo deja de guardar.
- `seguridad.md` lo dice.
- Una conversación cargada es **texto para mostrar**. No reactiva herramientas, no reaplica ediciones, y lo que haya en ella no cambia el modo ni los permisos de la sesión actual.

---

## T7 — Documentación

- `docs/03-requerimientos-funcionales.md`: RF-506, RF-507, RF-607, RF-608 y RF-1009.
- `docs/05-modelo-de-datos.md`: los campos nuevos de los breakpoints y de la sesión, el archivo de conversaciones y la setting.
- `docs/convenciones/seguridad.md`: la autenticación de Git delegada, y las conversaciones en disco.
- `CHANGELOG.md` y `PROGRESO.md`.

---

## Criterios de aceptación

1. Los cuatro comandos de verificación pasan, y el CI del PR está en verde.
2. El diff muestra el archivo contra `HEAD`, el lado derecho se puede editar y guardar, y el instalador sigue dentro de RNF-05.
3. Ninguna operación de red de Git puede dejar un proceso esperando una contraseña. Hay test con un `git` falso.
4. Descartar cambios pide confirmación y nombra el archivo.
5. Una sesión guardada antes de esta etapa sigue cargando. Hay test.
6. El debug sólo ofrece lo que el adaptador anuncia.
7. Las conversaciones guardadas no contienen checkpoints ni la clave, y apagar la setting las borra. Hay tests de las dos cosas.
8. Cada parte entregada está completa; lo no entregado está listado en `PROGRESO.md`.

## Trampas

- **RNF-04.** El editor de diff son dos editores. Se monta sólo mientras se usa y se descarta al salir, modelo incluido.
- **El gutter de Git** ya compara rutas con cuidado después del bug de la unidad en minúscula. El diff nuevo toca la misma zona.
- **`git` anterior a 2.23** no tiene `restore`. El riesgo ya está anotado en el roadmap para el unstage: seguí el mismo criterio de detección y de mensaje.
- **Los dobles del adaptador los usa el E2E existente.** Ampliarlos sin romper `debug.spec.ts` ni `debug-session.spec.ts`.
- **El asistente en modo `agent` deja checkpoints.** Al cargar una conversación vieja, los botones de deshacer de esas ediciones no pueden aparecer: ya no hay con qué deshacer.
