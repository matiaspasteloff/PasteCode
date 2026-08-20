# 00 — Guía paso a paso

[Índice](./README.md) · [Siguiente: Visión y alcance →](./01-vision-y-alcance.md)

> El orden importa más que las fechas. Los tiempos son estimaciones flojas para trabajo part-time de una persona; tomalos como proporciones entre etapas, no como compromisos.
>
> La lógica del orden: **primero lo que es caro de cambiar después.** El tooling antes que el código, el contrato de IPC antes que las features, la medición antes que la optimización.

---

## Etapa 0 — Antes de escribir código

_~2 días_

**1. Elegí el nombre.** ✅ **`PasteCode`.** Aparece en el package name, el repo, el binario, el instalador y el protocolo de deep links. Cambiarlo en la semana 10 es una tarde perdida. `Forge` era el placeholder y estaba tomado por varias cosas; `pastecode` está libre en npm, así que el scope del monorepo es `@pastecode/*`.

La identidad derivada queda fijada acá y no se toca más:

| Elemento                        | Valor                     |
| ------------------------------- | ------------------------- |
| Scope de npm                    | `@pastecode/*`            |
| `appId` del instalador          | `com.pasteloff.pastecode` |
| Protocolo de deep link          | `pastecode://`            |
| Directorio de datos del usuario | `~/.pastecode/`           |

**2. Leé tu propia documentación de una sentada.** En serio. Vas a encontrar contradicciones y cosas que ya no querés. Corregilas ahora, mientras cambiar de opinión es gratis.

**3. Creá el repo con la documentación primero.** Antes que una línea de código: `docs/`, `PROJECT.md`, `CLAUDE.md`, `LICENSE` (MIT), `.gitignore`.

**4. Protegé `main`.** Settings → Branches → require pull request. Sí, aunque trabajes solo. Es lo que fuerza el hábito del PR, y el PR es donde queda registrado tu razonamiento.

> **Checkpoint:** el repo existe, está documentado y todavía no hace nada. Eso está perfecto.

---

## Etapa 1 — Andamio

_~1 semana_

Esta etapa no produce ninguna feature y es la más importante del proyecto. Un tooling flojo te va a sangrar tiempo durante seis meses.

**5. Monorepo vacío.** `pnpm-workspace.yaml` + `turbo.json` + las carpetas de la [estructura](./02-arquitectura.md#estructura-del-monorepo), cada una con un `package.json` mínimo. Vacías está bien.

Turborepo entra desde el arranque, como ya declaraba la [Fase 0 del roadmap](./06-roadmap-y-riesgos.md#fase-0--fundaciones). Los scripts de la raíz siguen llamándose igual que en [`CLAUDE.md`](../CLAUDE.md#comandos-del-proyecto); lo que cambia es que delegan en `turbo`, que resuelve el orden de build entre paquetes y cachea lo que no cambió. Agregarlo después implica reescribir todos los scripts y el CI.

La estructura del monorepo se scaffoldea **sólo con lo que estas dos etapas usan** — `apps/desktop`, `packages/core`, `packages/ipc-contract` y `e2e/`. `extension-api`, `extension-host`, `ui` y `extensions/` aparecen en la [arquitectura](./02-arquitectura.md#estructura-del-monorepo) como destino, pero crear carpetas vacías que nadie importa sólo le da trabajo a Knip.

**6. `tsconfig.base.json` con `strict` y todos los flags.** Ponelos **ahora**. Activar `noUncheckedIndexedAccess` con 8.000 líneas escritas es un infierno; con 0 líneas es gratis.

**7. ESLint + Prettier + Husky + commitlint.** Que el pre-commit corra lint y typecheck desde el primer commit.

**8. Electron "hola mundo".** Main que abre una ventana, preload con `contextBridge`, renderer con Vite y React. Con la [config de seguridad completa desde el arranque](./convenciones/seguridad.md#configuración-obligatoria-de-electron) — nunca con `nodeIntegration: true` "por ahora, después lo arreglo", porque después no se arregla.

**9. Un test de cada tipo.** Un unitario en Vitest y un E2E en Playwright que abra la app y verifique que la ventana existe. Triviales, pero dejan la infraestructura de testing andando.

**10. CI en GitHub Actions.** typecheck + lint + test en las 3 plataformas.

**11. `electron-builder` produciendo un `.exe`.** Bajátelo, instalalo, abrilo.

> **Checkpoint:** instalaste tu propia app y te muestra una ventana en blanco. No parece mucho. Es la mitad del riesgo técnico del proyecto eliminado.

---

## Etapa 2 — Editor mínimo ✅

_~3 semanas estimadas_ · **Cerrada**

Objetivo: abrir una carpeta, editar un archivo, guardarlo.

> **Cerrada.** Los ocho pasos están hechos. Lo que salió distinto de lo previsto:
>
> - **El paso 14 obligó a cambiar cómo se carga el renderer.** Bajo `file://` el origen es opaco y Chromium no deja construir los web workers que Monaco necesita. Se verificó con un spike antes de decidir y se resolvió sirviendo el renderer desde un esquema propio ([ADR-0012](./adr/0012-servir-el-renderer-desde-un-protocolo-propio.md)).
> - **El guardado atómico se adelantó del paso 15 al 12.** RNF-07 dice que _todo_ guardado es atómico; escribir primero la versión no atómica era escribir código que ya sabíamos que estaba mal.
> - **RF-101 se corrigió**: pedía TextMate y Monaco usa Monarch. Ver la nota en [requerimientos funcionales](./03-requerimientos-funcionales.md#editor).
> - **Los ADRs que produjo:** [0004](./adr/0004-zustand-para-el-estado-del-renderer.md), [0011](./adr/0011-resultado-tipado-en-el-limite-de-ipc.md) y [0012](./adr/0012-servir-el-renderer-desde-un-protocolo-propio.md).

**12. El contrato de IPC y el servicio de filesystem.** Empezá por acá, no por la UI. Definí `packages/ipc-contract` con dos canales (`fs:readFile`, `fs:writeFile`), el handler en el main con validación Zod y [validación de rutas](./convenciones/seguridad.md#validación-de-rutas). Con sus tests.

Es tentador arrancar por la pantalla porque se ve. No lo hagas: si el patrón de IPC te queda mal, lo vas a arrastrar a los otros 40 canales.

**13. Abrir carpeta + árbol de archivos.** Diálogo nativo, listado recursivo lazy, virtualizado desde el principio.

**14. Monaco con un solo archivo.** Click en el árbol → se abre. Sin pestañas todavía.

**15. Guardar, atómico.** `Ctrl+S`, indicador de dirty. Temporal + `rename()`, no `writeFile` directo.

**16. Pestañas múltiples.** Acá aparece el `EditorModelRegistry` — el punto donde Monaco se pone incómodo. Resolvelo bien, es la base de todo lo demás.

**17. Registry de comandos + paleta.** Toda acción de la UI pasa a ser un comando registrado. Refactorizá lo que ya hiciste para que use comandos.

**18. Keybindings con cláusulas `when`.** El resolver es lógica pura en `packages/core` — es el ejemplo perfecto de código 100% testeable, aprovechalo.

**19. Temas claro y oscuro.** Variables CSS, no clases condicionales.

> **Checkpoint:** abrís el código de PasteCode con PasteCode y editás un archivo. **A partir de acá usá tu propio editor todos los días.** El dogfooding es lo que va a mantener el proyecto vivo y lo que te va a mostrar los bugs que importan.

---

## Etapa 3 — Herramientas de desarrollo ✅

_~4 semanas estimadas_ · **Cerrada**

> **Cerrada.** Los seis pasos están hechos, en siete PRs. Lo que salió distinto de lo previsto:
>
> - **Apareció un paso 19½ que no estaba.** `PasteCodeApi` sólo tenía `invoke`, y la terminal, la recarga en caliente de settings y el streaming de búsqueda necesitan que el main empuje. El primitivo de eventos se hizo primero y lo comparten las tres ([ADR-0013](./adr/0013-eventos-tipados-en-el-ipc.md)).
> - **El schema de settings documentado no se podía usar.** Tenía `.default()` por campo pero no en los grupos, así que un archivo parcial —el único que alguien escribe— no parseaba. Se partió en dos ([ADR-0005](./adr/0005-settings-en-json-con-schema-zod.md)).
> - **RNF-05 se dio vuelta.** `electron-builder` copiaba Monaco al asar aunque Vite ya lo bundlea: el instalador bajó de 110MB a 97,7MB **agregando** node-pty, xterm y ripgrep.
> - **RNF-10 describía sólo la mitad del problema.** En Windows no hay señales; conpty termina la consola con un `kill()` sin argumentos y pasarle una señal lanza.
> - **El primer número de RNF-04 dio 402MB contra un techo de 400**, y el desglose por proceso mostró que era doble conteo de las páginas compartidas de Chromium.
> - **Los ADRs que produjo:** [0005](./adr/0005-settings-en-json-con-schema-zod.md), [0007](./adr/0007-ripgrep-como-binario-externo.md), [0013](./adr/0013-eventos-tipados-en-el-ipc.md), [0014](./adr/0014-node-pty-con-binarios-precompilados.md) y [0015](./adr/0015-presupuestos-absolutos-de-performance.md).

**20. Terminal integrada.** `node-pty` en el main, `xterm.js` en el renderer. Es tu primer proceso hijo de verdad: escribí acá el patrón de supervisión (spawn, resize, kill, limpieza al cerrar) porque lo vas a reutilizar para LSP y DAP. Verificá con el Administrador de tareas que no quedan procesos huérfanos.

**21. Settings persistidas.** Schema Zod, precedencia usuario/workspace, recarga en caliente.

**22. Estado de sesión.** Al reabrir, las mismas pestañas en la misma posición. Es de las cosas que más cambian la percepción de "esto es un producto de verdad".

**23. Búsqueda en workspace.** Empezá con `ripgrep` como binario externo; es más rápido de implementar y de ejecutar que hacerlo con worker threads. Anotá la decisión como ADR-0007.

**24. Quick open (`Ctrl+P`).** Índice de archivos en memoria + fuzzy matching.

**25. Instrumentá la performance y ponela en el CI.** Medí arranque, latencia de input y RAM. Fijá los presupuestos de los [RNF](./04-requerimientos-no-funcionales.md#performance) y hacé que el CI falle si se degradan.

Esto va acá, no al final. Si medís en la semana 24 vas a descubrir una regresión introducida en la semana 6 y no vas a saber dónde. Además, es lo que un revisor técnico va a mirar con más interés.

> **Checkpoint:** el CI reporta números de performance en cada PR. Ya no es un proyecto de juguete.

---

## Etapa 4 — Inteligencia de lenguaje y Git

_~6 semanas estimadas_ · **Cerrada**

> **Cerrada.** Los cinco pasos están hechos, en trece PRs. Lo que salió distinto de lo previsto:
>
> - **Apareció un paso 26½ que no estaba.** El cascarón —barra de actividades, vistas por registro, barra de estado compuesta— se hizo **antes** que el LSP y que Git. Sin él, cada feature nueva habría tenido que negociar con las otras dónde dibujarse: el panel de problemas y el de Git son hoy una entrada en un registro cada uno ([ADR-0022](./adr/0022-cascaron-con-barra-de-actividades.md)). Mismo precedente que el paso 19½ de la Etapa 3.
> - **`simple-git` se descartó por nombre.** El paso 29 lo sugería; no resuelve el problema del `PATH`, lo esconde. `seguridad.md` **se enmendó, no se violó**: candidatos absolutos conocidos primero y `PATH` sólo para construir candidatos que después se verifican ([ADR-0019](./adr/0019-git-con-spawn-crudo.md)).
> - **`monaco-languageclient` tampoco entró.** Arrastra decenas de MB contra los 22,3MB de margen de RNF-05, y espera un Monaco parcheado. Se habla el protocolo con `vscode-jsonrpc`, que son ~200KB y cero dependencias de runtime ([ADR-0017](./adr/0017-cliente-lsp-con-vscode-jsonrpc.md)).
> - **El paso 28 pasó su propio examen.** Agregar Python y Rust fueron **dos archivos y cero código nuevo**: dos filas en `LANGUAGE_SERVERS` y sus tests.
> - **RNF-04 se partió en dos presupuestos.** `tsserver` en reposo son 150-300MB, y un solo número obligaba a elegir entre un techo que no se puede cumplir con LSP o uno que no dice nada sin él ([ADR-0021](./adr/0021-presupuesto-de-ram-partido.md)).
> - **RF-107 se entrega con dos grupos y no con tres.** El módulo puro está escrito para N; lo que falta es UI ([ADR-0023](./adr/0023-dos-grupos-sobre-modelos-compartidos.md)).
> - **El límite de la suite E2E se corrigió**, no se ignoró: decía "30 tests" y describía spec files. Ver [testing.md](./convenciones/testing.md).
> - **Los ADRs que produjo:** [0016](./adr/0016-supervisor-de-procesos-generico.md), [0017](./adr/0017-cliente-lsp-con-vscode-jsonrpc.md), [0018](./adr/0018-sincronizacion-incremental-de-documentos.md), [0019](./adr/0019-git-con-spawn-crudo.md), [0020](./adr/0020-watcher-unico-con-chokidar.md), [0021](./adr/0021-presupuesto-de-ram-partido.md), [0022](./adr/0022-cascaron-con-barra-de-actividades.md) y [0023](./adr/0023-dos-grupos-sobre-modelos-compartidos.md).

**26. Generalizá el supervisor de procesos.** Antes de tocar LSP, extraé lo que aprendiste con el PTY a un supervisor reutilizable: spawn, health check, reinicio con backoff, límite de 3 intentos, logging.

**27. LSP con TypeScript solamente.** Diagnósticos primero (lo más visible), después completado, hover, go-to-definition. Un solo lenguaje, bien.

**28. Agregá Python y Rust.** Este paso es un test de tu diseño: si agregar un lenguaje requiere sólo configuración y cero código nuevo, la abstracción está bien. Si tenés que escribir código específico por lenguaje, volvé al paso 27 y arreglalo. **Es más barato ahora que nunca.**

**29. Panel de Git.** Status, stage, commit, branch, indicadores en el gutter. Usá `simple-git` o los comandos directamente; no uses `isomorphic-git`, que no maneja bien repos grandes.

> Se hizo con los comandos directamente. `simple-git` lanza `git` por nombre y deja que el sistema operativo lo busque en el `PATH` en el momento de la llamada, que es lo que `seguridad.md` prohíbe.

**30. Split view.** Ahora que hay algo que valga la pena mirar en paralelo.

> **Checkpoint:** el IDE se autoedita con autocompletado funcionando. Este es el momento de sacar el primer GIF y publicarlo.

---

## Etapa 5 — Extensiones y debugging ✅

_~8 semanas_

Esta es la etapa que justifica el proyecto. Todo lo anterior lo tiene cualquier editor de tutorial; esto no.

**31. Diseñá la API en tipos antes de implementar nada.** Escribí `packages/extension-api` como puros tipos e interfaces, sin implementación. Después escribí el código de las dos extensiones de ejemplo **contra esa API que todavía no existe**. Vas a descubrir que la API es incómoda, y corregirla en ese momento cuesta minutos.

**32. El proceso aislado y el RPC.** `utilityProcess.fork()`, `MessagePort`, protocolo tipado, timeout de 5s, reinicio ante crash. Testeá el crash a propósito: una extensión con `process.exit(1)` no puede tumbar el IDE.

**33. Carga de extensiones.** Escaneo de carpeta, validación del manifest, activation events, capabilities.

**34. Implementá la API mínima.** Comandos + status bar + acceso al documento activo. Nada más por ahora.

**35. Hacé andar las dos extensiones de ejemplo.** Con su README cada una.

**36. Documentá la API.** `docs/extension-api/`. El test real: ¿podría alguien escribir una extensión leyendo sólo esto?

**37. Debugging de Node.js.** `vscode-js-debug` vía DAP. Breakpoints, controles, variables, call stack, consola. Reutiliza el supervisor de procesos del paso 26.

> **Checkpoint:** una extensión de terceros corre aislada y no puede romperte la app. Escribí un post técnico sobre esto — es lo más interesante que hiciste.

### Lo que salió distinto de lo previsto

**Lo que costó no fue lo que se esperaba.** El riesgo anotado era "la complejidad del extension host consume la etapa entera", y no pasó: la API creció de comandos a status bar, documento activo y temas sin desbordar. Lo que sí mordió fue **la memoria** —el host ocupa 64,5MB y dejó a RNF-04 con 3,2MB de margen— y **el orden de arranque**, que produjo tres bugs seguidos del mismo tipo.

**Los tres bugs de "mirar algo antes de que exista".** El host se forkeaba antes de crear la ventana, así que su evento de extensiones cargadas se emitía sin nadie escuchando. Las decoraciones de breakpoints se pintaban antes de que Monaco terminara de importarse, así que un breakpoint restaurado se guardaba bien y no se veía nunca. Y el listener del gutter se enganchaba a un editor que todavía era `null`. Ninguno lo vio el compilador; los tres los encontró el E2E.

**El peor no se pareció en nada a su síntoma.** `syncCommands` volvía a registrar comandos ya registrados, el registro lanza ante un id repetido, y la excepción se comía el resto del listener. Lo que se veía era **la status bar congelada en su primer valor**. Encontrarlo llevó seis diagnósticos.

**Monaco devuelve las rutas con la unidad en minúscula.** Comparar con `===` contra una ruta del proyecto da falso entre dos rutas que son el mismo archivo, sin error a la vista. Destapó que **el gutter de Git tenía la misma comparación** desde la Etapa 4.

**El paso 31 se pagó solo.** Escribir las extensiones contra una API que no existía es lo que hizo evidente que `documentRead` sola no alcanzaba, que un tema no necesita `main`, y que los setters de la status bar no podían ser propiedades. Las tres correcciones costaron minutos ahí y habrían costado un refactor después.

**S3 no se pudo cerrar midiendo, y se dice.** `vscode-js-debug` no está instalado en la máquina de desarrollo, así que en vez de escribir código contra una invocación no verificada se diseñó para que la pregunta deje de importar. RF-508 queda parcial a propósito.

---

## Etapa 6 — Lanzamiento

_~4 semanas_

**38. Auto-update.** `electron-updater` + GitHub Releases. Con consentimiento explícito, nunca silencioso.

**39. Pasada de accesibilidad.** Navegación completa por teclado, contraste, ARIA. Probalo con un lector de pantalla al menos una vez.

**40. Pasada de errores.** Revisá cada mensaje visible al usuario: ¿dice qué pasó y qué hacer? Ningún stack trace crudo.

**41. README que venda el proyecto.** GIF de demo arriba de todo, capturas, sección de arquitectura con el diagrama de procesos, links a los ADRs. Este archivo es lo que más gente va a leer de todo el repo — dedicale un día entero.

**42. Release v1.0.0.**

**43. Escribí el post técnico.** Elegí una decisión difícil —el aislamiento del extension host, o por qué Electron y no Tauri— y contala con el razonamiento completo. Publicalo donde te lea gente del rubro.

---

## Etapa Experimental 1 — Asistente de IA y pasada de UI

_~2 semanas_

**Numeración propia (E1.1 … E1.7), no 44 en adelante.** Los pasos 1-43 son el roadmap de la v1 y su numeración es una referencia estable: `docs/06-roadmap-y-riesgos.md`, los ADRs y los cierres de etapa apuntan a números concretos. Esta etapa va **al lado** del contrato de alcance y no adentro (ver [Alcance experimental](./01-vision-y-alcance.md#alcance-experimental)), así que numerarla como continuación diría lo contrario de lo que es.

**E1.1. Documentación primero.** El módulo RF-10xx, la sección de alcance experimental, y los ADR-0029, 0030 y 0031 antes de una línea de código. Es la misma regla que la Etapa 5: si la decisión no se puede escribir, no está tomada.

**E1.2. El contrato del asistente.** `packages/ipc-contract/src/schemas/ai.ts`, siete canales y tres eventos. El streaming va por evento y no por `invoke` por lo mismo que `search:result`: una respuesta son cientos de chunks y `invoke` sólo sabe responder preguntas. Las herramientas de escritura usan el pull correlacionado de [ADR-0026](./adr/0026-broker-unico-y-pull-del-documento-activo.md).

**E1.3. La lógica pura.** Parser de SSE, filtro de modelos gratuitos, recorte por presupuesto de contexto, validación de los argumentos que devuelve el modelo, y un partidor de markdown en prosa y bloques de código. Todo en `packages/core`, todo con test — que es lo que evita meter una librería de markdown y una de SSE contra el techo de RNF-05.

**E1.4. El main.** La clave en `safeStorage`, la llamada HTTP con `fetch` nativo y el loop de herramientas. **La red vive acá y no en el renderer**: es lo que deja la CSP con `connect-src 'self'` sin una excepción nueva.

**E1.5. La vista.** Una entrada más en `SIDE_VIEWS` y en `SIDE_VIEW_REGISTRY`. Ése es el punto del registro de ADR-0022 y es la prueba de que el cascarón aguanta una cuarta vista sin tocarse.

**E1.6. La barra de título.** `frame: false` y una barra propia con menús, caja de comandos y botones de ventana. Deroga la parte de ADR-0022 que defendía el marco nativo; ver [ADR-0030](./adr/0030-barra-de-titulo-propia.md).

**E1.7. Temas y bugs.** Nueve temas incorporados **como datos** ([ADR-0031](./adr/0031-temas-incorporados-como-datos.md)), y los tres bugs que salieron de usar el IDE todos los días: el hueco al colapsar el explorador, cerrar pestañas con la ruedita, y la terminal.

> **Checkpoint:** el IDE se usa para escribir el IDE, y esta etapa salió entera de esa costumbre. Los tres bugs no los encontró ningún test.

### Lo que salió distinto de lo previsto

**El bug del hueco era CSS, no React.** La sospecha era que `SideView` devolvía `null` y algo quedaba montado. La causa real es que ninguno de los tres hijos de la fila 2 declaraba su columna: caían por auto-placement, y con la barra colapsada el área de edición se corría a la columna 2 —que es `auto`— dejando la 3 (`1fr`) vacía. Tres declaraciones de `grid-column` lo cerraron.

**El `>>>>>>>` de la terminal era un problema de orden, no de conpty.** El PTY se abría con un `80×24` hardcodeado antes de que xterm existiera; el `fit()` posterior mandaba el tamaño real y conpty **reproduce su buffer** al recibir un resize, lo que hacía que PSReadLine redibujara el prompt encima de sí mismo. Invertir el orden —montar xterm, medir, y recién ahí crear la sesión— lo eliminó sin tocar una línea del supervisor.

**`-webkit-app-region` es el error clásico de la barra de título.** Un botón sin `no-drag` no se puede clickear, y el síntoma —"el botón no anda"— no se parece a la causa. Va como regla en `global.css` sobre **todos** los hijos interactivos de la barra, no caso por caso.

---

## Reglas de ritmo

Lo que hace fracasar proyectos como este no es la dificultad técnica. Es el mes cuatro.

- **Cerrá cada etapa antes de empezar la siguiente.** Tests, documentación, CI verde. Etapas a medias se acumulan y en algún momento el proyecto se vuelve deprimente de abrir.

- **Usá el IDE todos los días desde la Etapa 2.** Es lo que convierte "debería seguir con esto" en "esto me molesta, lo arreglo".

- **Publicá al cerrar cada etapa.** Un GIF, un post corto, un commit visible. El feedback externo es combustible, y de paso el portfolio se va construyendo solo en vez de esperar a la v1.0.

- **Cuando quieras agregar algo que no está en el plan, anotalo en un archivo `IDEAS.md` y seguí.** Casi todas te van a parecer malas dos semanas después. Las que sigan pareciendo buenas entran en la próxima etapa, sacando otra cosa.

- **Si una tarea te traba más de dos días, es que es más de una tarea.** Partila.

- **Está permitido bajar el alcance, no la calidad.** Si el DAP se hace demasiado, sacalo y documentá por qué. Un proyecto de 5 etapas terminadas vale mucho más que uno de 6 a medio hacer.

---

[Índice](./README.md) · [Siguiente: Visión y alcance →](./01-vision-y-alcance.md)
