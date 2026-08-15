# 00 — Guía paso a paso

[Índice](./README.md) · [Siguiente: Visión y alcance →](./01-vision-y-alcance.md)

> El orden importa más que las fechas. Los tiempos son estimaciones flojas para trabajo part-time de una persona; tomalos como proporciones entre etapas, no como compromisos.
>
> La lógica del orden: **primero lo que es caro de cambiar después.** El tooling antes que el código, el contrato de IPC antes que las features, la medición antes que la optimización.

---

## Etapa 0 — Antes de escribir código

*~2 días*

**1. Elegí el nombre.** ✅ **`PasteCode`.** Aparece en el package name, el repo, el binario, el instalador y el protocolo de deep links. Cambiarlo en la semana 10 es una tarde perdida. `Forge` era el placeholder y estaba tomado por varias cosas; `pastecode` está libre en npm, así que el scope del monorepo es `@pastecode/*`.

La identidad derivada queda fijada acá y no se toca más:

| Elemento | Valor |
|---|---|
| Scope de npm | `@pastecode/*` |
| `appId` del instalador | `com.pasteloff.pastecode` |
| Protocolo de deep link | `pastecode://` |
| Directorio de datos del usuario | `~/.pastecode/` |

**2. Leé tu propia documentación de una sentada.** En serio. Vas a encontrar contradicciones y cosas que ya no querés. Corregilas ahora, mientras cambiar de opinión es gratis.

**3. Creá el repo con la documentación primero.** Antes que una línea de código: `docs/`, `PROJECT.md`, `CLAUDE.md`, `LICENSE` (MIT), `.gitignore`.

**4. Protegé `main`.** Settings → Branches → require pull request. Sí, aunque trabajes solo. Es lo que fuerza el hábito del PR, y el PR es donde queda registrado tu razonamiento.

> **Checkpoint:** el repo existe, está documentado y todavía no hace nada. Eso está perfecto.

---

## Etapa 1 — Andamio

*~1 semana*

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

## Etapa 2 — Editor mínimo

*~3 semanas*

Objetivo: abrir una carpeta, editar un archivo, guardarlo.

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

## Etapa 3 — Herramientas de desarrollo

*~4 semanas*

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

*~6 semanas*

**26. Generalizá el supervisor de procesos.** Antes de tocar LSP, extraé lo que aprendiste con el PTY a un supervisor reutilizable: spawn, health check, reinicio con backoff, límite de 3 intentos, logging.

**27. LSP con TypeScript solamente.** Diagnósticos primero (lo más visible), después completado, hover, go-to-definition. Un solo lenguaje, bien.

**28. Agregá Python y Rust.** Este paso es un test de tu diseño: si agregar un lenguaje requiere sólo configuración y cero código nuevo, la abstracción está bien. Si tenés que escribir código específico por lenguaje, volvé al paso 27 y arreglalo. **Es más barato ahora que nunca.**

**29. Panel de Git.** Status, stage, commit, branch, indicadores en el gutter. Usá `simple-git` o los comandos directamente; no uses `isomorphic-git`, que no maneja bien repos grandes.

**30. Split view.** Ahora que hay algo que valga la pena mirar en paralelo.

> **Checkpoint:** el IDE se autoedita con autocompletado funcionando. Este es el momento de sacar el primer GIF y publicarlo.

---

## Etapa 5 — Extensiones y debugging

*~8 semanas*

Esta es la etapa que justifica el proyecto. Todo lo anterior lo tiene cualquier editor de tutorial; esto no.

**31. Diseñá la API en tipos antes de implementar nada.** Escribí `packages/extension-api` como puros tipos e interfaces, sin implementación. Después escribí el código de las dos extensiones de ejemplo **contra esa API que todavía no existe**. Vas a descubrir que la API es incómoda, y corregirla en ese momento cuesta minutos.

**32. El proceso aislado y el RPC.** `utilityProcess.fork()`, `MessagePort`, protocolo tipado, timeout de 5s, reinicio ante crash. Testeá el crash a propósito: una extensión con `process.exit(1)` no puede tumbar el IDE.

**33. Carga de extensiones.** Escaneo de carpeta, validación del manifest, activation events, capabilities.

**34. Implementá la API mínima.** Comandos + status bar + acceso al documento activo. Nada más por ahora.

**35. Hacé andar las dos extensiones de ejemplo.** Con su README cada una.

**36. Documentá la API.** `docs/extension-api/`. El test real: ¿podría alguien escribir una extensión leyendo sólo esto?

**37. Debugging de Node.js.** `vscode-js-debug` vía DAP. Breakpoints, controles, variables, call stack, consola. Reutiliza el supervisor de procesos del paso 26.

> **Checkpoint:** una extensión de terceros corre aislada y no puede romperte la app. Escribí un post técnico sobre esto — es lo más interesante que hiciste.

---

## Etapa 6 — Lanzamiento

*~4 semanas*

**38. Auto-update.** `electron-updater` + GitHub Releases. Con consentimiento explícito, nunca silencioso.

**39. Pasada de accesibilidad.** Navegación completa por teclado, contraste, ARIA. Probalo con un lector de pantalla al menos una vez.

**40. Pasada de errores.** Revisá cada mensaje visible al usuario: ¿dice qué pasó y qué hacer? Ningún stack trace crudo.

**41. README que venda el proyecto.** GIF de demo arriba de todo, capturas, sección de arquitectura con el diagrama de procesos, links a los ADRs. Este archivo es lo que más gente va a leer de todo el repo — dedicale un día entero.

**42. Release v1.0.0.**

**43. Escribí el post técnico.** Elegí una decisión difícil —el aislamiento del extension host, o por qué Electron y no Tauri— y contala con el razonamiento completo. Publicalo donde te lea gente del rubro.

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
