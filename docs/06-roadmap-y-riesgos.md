# 06 — Roadmap y riesgos

[← Modelo de datos](./05-modelo-de-datos.md) · [Índice](./README.md) · [Siguiente: Glosario →](./07-glosario.md)

> Este documento define **qué** entrega cada fase. La [guía paso a paso](./00-guia-paso-a-paso.md) define **en qué orden** hacerlo y por qué ese orden.

Cada fase tiene un entregable demostrable. La regla: **no se empieza una fase sin haber cerrado la anterior con sus tests y su documentación**.

---

## Fase 0 — Fundaciones

**Entregable:** una ventana de Electron vacía que arranca, con todo el tooling funcionando.

- [x] Monorepo configurado (pnpm workspaces + Turborepo)
- [x] Electron + Vite + TypeScript strict compilando
- [x] ESLint, Prettier, Husky, commitlint configurados
- [x] Vitest y Playwright corriendo con un test de humo cada uno
- [ ] CI en GitHub Actions verde en las 3 plataformas — el workflow está escrito y sus pasos pasan localmente, pero **no se marca hasta que corra de verdad en GitHub**
- [x] `electron-builder` produciendo un `.exe` instalable
- [x] [ADR-0001](./adr/0001-electron-typescript.md), [0002](./adr/0002-monaco-editor.md) y [0003](./adr/0003-extension-host-aislado.md) escritos
- [x] [ADR-0006](./adr/0006-electron-vite-como-build.md), [0009](./adr/0009-pinear-typescript-y-vite.md) y [0010](./adr/0010-import-x-no-cycle.md), que aparecieron al montar el andamio
- [x] Esta documentación en el repo

**Criterio de salida:** `git push` → CI verde → `.exe` descargable desde el artifact.

## Fase 1 — Editor mínimo usable ✅

**Entregable:** se puede abrir una carpeta, editar un archivo y guardarlo.

- [x] RF-001, RF-002 (abrir workspace y árbol jerárquico virtualizado)
- [x] RF-101, RF-102, RF-104, RF-106 (Monaco, pestañas, dirty state, undo)
- [x] RF-701 (paleta de comandos con fuzzy matching)
- [x] RF-801, RF-802 (temas claro/oscuro y seguir el del SO)
- [x] RNF-07 (guardado atómico)
- [x] Contrato de IPC establecido y tipado ([ADR-0011](./adr/0011-resultado-tipado-en-el-limite-de-ipc.md))
- [x] Resolver de keybindings con cláusulas `when` — la mitad de RF-702 que es lógica pura

**Criterio de salida:** dogfooding. Editás un archivo de este proyecto usando el propio IDE. ✅

> **Lo que quedó afuera y por qué.** El checklist original de esta fase decía "RF-001 a RF-005" y "RF-701, RF-702" en bloque, y las [Etapa 2 de la guía](./00-guia-paso-a-paso.md#etapa-2--editor-mínimo) —pasos 12 a 19— nunca incluyó esos requerimientos completos. Se corrige acá en vez de tildarlos de más:
>
> | Requerimiento                                        | Estado                                                                        | Dónde se cierra                       |
> | ---------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------- |
> | RF-005 (`files.exclude` configurable)                | ✅ Cerrado en la Fase 2, con las settings                                     | —                                     |
> | RF-702 (`keybindings.json` editable, con conflictos) | Parcial: el resolver está; falta el archivo del usuario                       | **Sin asignar** tras cerrar la Fase 2 |
> | RF-003 (crear, renombrar, eliminar)                  | Sin implementar. No hay canal de IPC que mute el árbol                        | **Sin asignar**                       |
> | RF-004 (detectar cambios externos)                   | Parcial: hay conflicto por `mtimeMs` al guardar; falta el watcher que recarga | **Sin asignar**                       |
>
> Los tres sin asignar son requerimientos `M`. Se resuelven al planificar la Fase 3, antes de sumarle alcance nuevo: la [regla de ritmo](./00-guia-paso-a-paso.md#reglas-de-ritmo) dice que bajar alcance es legítimo mientras quede escrito, y esto es dejarlo escrito.

## Fase 2 — Herramientas de desarrollo ✅

**Entregable:** deja de ser un editor de texto y empieza a ser un IDE.

- [x] RF-301 a RF-305 (terminal integrada) — [ADR-0014](./adr/0014-node-pty-con-binarios-precompilados.md)
- [x] RF-201 a RF-203, RF-205 (búsqueda en workspace y quick open) — [ADR-0007](./adr/0007-ripgrep-como-binario-externo.md)
- [x] RF-103, RF-105 (multi-cursor, buscar/reemplazar) — nativos de Monaco, verificados en `e2e/tests/editing.spec.ts`
- [x] RF-704, RF-705, RF-707 (settings y persistencia de sesión) — [ADR-0005](./adr/0005-settings-en-json-con-schema-zod.md)
- [x] RF-005 — `files.exclude` reemplaza a la constante `DEFAULT_EXCLUDES`
- [x] RNF-01, RNF-02 y RNF-04 medidos y con presupuesto en CI — [ADR-0015](./adr/0015-presupuestos-absolutos-de-performance.md)
- [x] Primitivo de eventos en el IPC, que la terminal, las settings y la búsqueda comparten — [ADR-0013](./adr/0013-eventos-tipados-en-el-ipc.md)

**Criterio de salida:** las métricas de performance están automatizadas y dentro de presupuesto. ✅

**Números al cerrar la fase**, medidos en la máquina de desarrollo:

| Requerimiento         | Medido   | Presupuesto |
| --------------------- | -------- | ----------- |
| RNF-01 arranque (p95) | 533 ms   | 1.500 ms    |
| RNF-02 latencia (p99) | 7,18 ms  | 16 ms       |
| RNF-04 memoria        | 303,5 MB | 400 MB      |
| RNF-05 instalador     | 97,7 MB  | 120 MB      |

> **Lo que quedó afuera.** **RF-702** —el `keybindings.json` del usuario, con detección de conflictos— sigue pendiente: el resolver y `findConflicts` están en `packages/core` desde la Fase 1, pero cargar el archivo del usuario no entró en ninguno de los siete PRs de la etapa. Se suma a RF-003 y RF-004 en la lista de deuda de la Fase 1. **RF-204** (reemplazar en todos los archivos) nunca estuvo en esta fase.

> **RNF-04 entra acá.** El checklist original listaba sólo RNF-01 y RNF-02, pero el [paso 25 de la guía](./00-guia-paso-a-paso.md#etapa-3--herramientas-de-desarrollo) pide medir también la RAM. Medir dos de los tres presupuestos y dejar el tercero para la Fase 5 contradice la razón por la que existen: RNF-04 y RNF-05 son la respuesta a la crítica obvia a Electron, y descubrir en la semana 24 que se pasan no deja margen para hacer nada.

## Fase 3 — Inteligencia de lenguaje ✅

**Entregable:** autocompletado y errores en vivo. Acá el proyecto se vuelve serio.

- [x] RF-401 a RF-405, RF-410 (LSP: completado, diagnósticos, hover, go-to-def)
- [x] RF-601 a RF-606 (Git básico)
- [x] RF-107 (split view) — **con 2 grupos y una nota de alcance**
- [x] Supervisión de procesos con reinicio ante crash (RNF-09) — para PTY y LSP
- [x] RF-004 (cambios externos), que venía sin fase desde la Fase 2

**Criterio de salida:** el IDE se autoedita con autocompletado de TypeScript funcionando.

**Números medidos al cerrar:**

| Presupuesto                      | Techo  | Medido        |
| -------------------------------- | ------ | ------------- |
| RNF-01 arranque (p95)            | 1,5s   | 533ms         |
| RNF-02 latencia de tecla (p99)   | 16ms   | 7,18ms        |
| RNF-04 RAM sin servidores        | 400MB  | 303,5MB       |
| RNF-04 RAM con TypeScript activo | 700MB  | _sonda nueva_ |
| RNF-05 instalador                | 120MB  | 97,7MB        |
| RF-401 tecla → diagnóstico (p95) | 1500ms | _sonda nueva_ |
| RF-402 popup de completado (p95) | 200ms  | _sonda nueva_ |

Las tres sondas marcadas son nuevas de esta fase: `lsp-latency.perf.ts` y el segundo escenario de `memory.perf.ts`. Los números se llenan con la primera corrida en el CI.

## Fase 4 — Extensibilidad y debugging

**Entregable:** la arquitectura que justifica todo el proyecto.

- [ ] RF-901 a RF-909 (host de extensiones y API pública)
- [ ] RF-501 a RF-505, RF-508 (debugging de Node.js)
- [ ] Documentación completa de la API de extensiones en `docs/extension-api/`
- [ ] Las 2 extensiones de ejemplo publicadas con su README

**Criterio de salida:** alguien más puede escribir una extensión siguiendo sólo la documentación.

## Fase 5 — Pulido y lanzamiento

**Entregable:** v1.0.0 pública.

- [ ] Auto-update funcionando
- [ ] Accesibilidad auditada (RNF-21 a RNF-25)
- [ ] Todos los RNF verificados y documentados
- [ ] README con capturas, GIF de demo y sección de arquitectura
- [ ] Landing page simple _(opcional, pero suma mucho al portfolio)_
- [ ] Post técnico explicando una decisión difícil del proyecto

**Criterio de salida:** un desconocido descarga el `.exe`, lo instala y lo usa sin leer nada.

---

## Riesgos identificados

| Riesgo                                                                  | Impacto  | Probabilidad | Mitigación                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------- | -------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope creep — "una feature más"                                         | Alto     | **Alta**     | La [lista de fuera de alcance](./01-vision-y-alcance.md#alcance--fuera-out-of-scope) es un contrato. Toda feature nueva requiere sacar otra                                                                                                                   |
| Monaco no permite alguna customización necesaria                        | Medio    | **Baja**     | Bajó al cerrar la Fase 2: lo único que Monaco no permitió fue TextMate, y se resolvió corrigiendo RF-101 y difiriendo RF-113                                                                                                                                  |
| Performance de Electron insuficiente para archivos grandes              | Alto     | **Baja**     | Bajó: los cuatro presupuestos se miden en el CI y ninguno pasa del 76% de su techo                                                                                                                                                                            |
| Complejidad del extension host consume la Fase 4 entera                 | Medio    | Media        | Empezar por una API mínima (comandos + status bar) y crecer                                                                                                                                                                                                   |
| Pérdida de motivación en un proyecto largo                              | **Alto** | Media        | Bajó: la Fase 2 cerró con siete PRs y el IDE ya se usa para escribirse a sí mismo                                                                                                                                                                             |
| **Deuda de requerimientos `M` sin fase asignada**                       | Medio    | Media        | Bajó en la Fase 3: RF-004 se cerró, y **RF-003, RF-702 y RNF-08 quedan asignados a la Fase 4**. Dejarlos sin fase una etapa más sería repetir el error que este riesgo señala                                                                                 |
| **Un binario de terceros cambia de formato y rompe una feature entera** | Medio    | **Media**    | Subió en la Fase 3: ahora son **cuatro** —ripgrep, node-pty, `git` y los servidores LSP—. Se verifica la forma de su salida en vez de asumirla, con parsers puros y testeados en `packages/core`                                                              |
| **`tsserver` en reposo consume el margen de RNF-04**                    | **Alto** | **Alta**     | **Nuevo en la Fase 3.** Son 150-300MB él solo. El presupuesto se partió en dos ([ADR-0021](./adr/0021-presupuesto-de-ram-partido.md)) y se apaga por inactividad a los 5 minutos, pero el escenario con tres lenguajes activos sigue sin margen               |
| **`git` ausente, o anterior a 2.23**                                    | Medio    | Media        | **Nuevo en la Fase 3.** Sin `git` la app anda igual y la UI de Git no se dibuja. Con uno anterior a 2.23 falla el unstage, que usa `git restore --staged`. Se detecta al arrancar y el mensaje es accionable                                                  |
| **Un rediseño de UI rompe los E2E existentes**                          | Medio    | **Alta**     | **Nuevo en la Fase 3, y ya se materializó dos veces** —un `role="tab"` duplicado y el `role="region"` perdido de la terminal—. La red los cazó las dos veces. Regla dura: no se renombra ni se borra un `data-testid`, y los selectores conservan sus nombres |

### Cómo revisar los riesgos

Al cerrar cada fase, se revisa esta tabla: se actualizan las probabilidades, se agregan los riesgos nuevos que aparecieron y se retiran los que ya no aplican. Un registro de riesgos que nunca cambia es un registro que nadie lee.

**Revisión al cerrar la Fase 3.** Tres riesgos nuevos, los tres de cosas que la fase reveló al implementarlas: el costo real de `tsserver`, la dependencia de una instalación de `git` que no controlamos, y la fragilidad de los E2E ante un rediseño —que no es hipotética, ya pasó dos veces—. Dos riesgos se movieron: el de los binarios de terceros subió porque ahora son cuatro, y el de la deuda de requerimientos bajó porque esta vez sí se asignaron.

**Revisión al cerrar la Fase 2.** Tres riesgos bajaron de probabilidad porque la fase produjo la evidencia que faltaba: Monaco resultó suficiente, los presupuestos se cumplen con margen, y el proyecto llegó al punto donde se usa a sí mismo. Aparecieron dos nuevos, los dos de la misma naturaleza —cosas que la fase reveló al implementarlas y no al planificarlas—.

---

[← Modelo de datos](./05-modelo-de-datos.md) · [Índice](./README.md) · [Siguiente: Glosario →](./07-glosario.md)
