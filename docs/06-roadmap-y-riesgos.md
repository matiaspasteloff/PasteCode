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
> | Requerimiento                                        | Estado                                                                        | Dónde se cierra                              |
> | ---------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------- |
> | RF-005 (`files.exclude` configurable)                | Parcial: las exclusiones existen como constante `DEFAULT_EXCLUDES`            | Fase 2, con las settings                     |
> | RF-702 (`keybindings.json` editable, con conflictos) | Parcial: el resolver está; falta el archivo del usuario                       | Fase 2, con las settings                     |
> | RF-003 (crear, renombrar, eliminar)                  | Sin implementar. No hay canal de IPC que mute el árbol                        | **Sin asignar** — no está en los pasos 20-25 |
> | RF-004 (detectar cambios externos)                   | Parcial: hay conflicto por `mtimeMs` al guardar; falta el watcher que recarga | **Sin asignar** — no está en los pasos 20-25 |
>
> Los dos últimos son requerimientos `M` sin fase asignada. Se resuelve al planificar la Fase 3, no antes: meterlos en la Fase 2 la desborda, y la [regla de ritmo](./00-guia-paso-a-paso.md#reglas-de-ritmo) dice que bajar alcance es legítimo mientras quede escrito.

## Fase 2 — Herramientas de desarrollo

**Entregable:** deja de ser un editor de texto y empieza a ser un IDE.

- [x] RF-301 a RF-305 (terminal integrada)
- [ ] RF-201 a RF-203, RF-205 (búsqueda en workspace y quick open)
- [ ] RF-103, RF-105 (multi-cursor, buscar/reemplazar)
- [x] RF-704, RF-705, RF-707 (settings y persistencia de sesión)
- [x] RF-005 — `files.exclude` reemplaza a la constante `DEFAULT_EXCLUDES`
- [ ] RF-702 — el `keybindings.json` del usuario
- [ ] RNF-01, RNF-02 y RNF-04 medidos y con presupuesto en CI

**Criterio de salida:** las métricas de performance están automatizadas y dentro de presupuesto.

> **RNF-04 entra acá.** El checklist original listaba sólo RNF-01 y RNF-02, pero el [paso 25 de la guía](./00-guia-paso-a-paso.md#etapa-3--herramientas-de-desarrollo) pide medir también la RAM. Medir dos de los tres presupuestos y dejar el tercero para la Fase 5 contradice la razón por la que existen: RNF-04 y RNF-05 son la respuesta a la crítica obvia a Electron, y descubrir en la semana 24 que se pasan no deja margen para hacer nada.

## Fase 3 — Inteligencia de lenguaje

**Entregable:** autocompletado y errores en vivo. Acá el proyecto se vuelve serio.

- [ ] RF-401 a RF-405, RF-410 (LSP: completado, diagnósticos, hover, go-to-def)
- [ ] RF-601 a RF-606 (Git básico)
- [ ] RF-107 (split view)
- [ ] Supervisión de procesos con reinicio ante crash (RNF-09)

**Criterio de salida:** el IDE se autoedita con autocompletado de TypeScript funcionando.

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

| Riesgo                                                     | Impacto  | Probabilidad | Mitigación                                                                                                                                  |
| ---------------------------------------------------------- | -------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope creep — "una feature más"                            | Alto     | **Alta**     | La [lista de fuera de alcance](./01-vision-y-alcance.md#alcance--fuera-out-of-scope) es un contrato. Toda feature nueva requiere sacar otra |
| Monaco no permite alguna customización necesaria           | Medio    | Media        | Prototipar las integraciones riesgosas en Fase 1, antes de comprometerse                                                                    |
| Performance de Electron insuficiente para archivos grandes | Alto     | Baja         | RNF-03 se mide desde Fase 2, no al final                                                                                                    |
| Complejidad del extension host consume la Fase 4 entera    | Medio    | Media        | Empezar por una API mínima (comandos + status bar) y crecer                                                                                 |
| Pérdida de motivación en un proyecto largo                 | **Alto** | **Alta**     | Cada fase entrega algo demostrable y publicable. El dogfooding desde Fase 1 mantiene el interés                                             |

### Cómo revisar los riesgos

Al cerrar cada fase, se revisa esta tabla: se actualizan las probabilidades, se agregan los riesgos nuevos que aparecieron y se retiran los que ya no aplican. Un registro de riesgos que nunca cambia es un registro que nadie lee.

---

[← Modelo de datos](./05-modelo-de-datos.md) · [Índice](./README.md) · [Siguiente: Glosario →](./07-glosario.md)
