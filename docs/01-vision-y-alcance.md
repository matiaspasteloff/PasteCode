# 01 — Visión y alcance

[← Guía paso a paso](./00-guia-paso-a-paso.md) · [Índice](./README.md) · [Siguiente: Arquitectura →](./02-arquitectura.md)

---

## Enunciado de visión

Un IDE de escritorio, liviano y extensible, que ofrezca la experiencia central de edición de código de VS Code —edición multi-cursor, autocompletado vía LSP, debugging vía DAP, terminal integrada y control de versiones— con un arranque medible más rápido y una arquitectura de extensiones documentada desde el primer día.

## Objetivo real del proyecto

Este es un proyecto de portfolio con ambición de producto. Eso implica dos objetivos que a veces tiran para lados opuestos, y conviene ser explícito:

| Objetivo | Implicancia práctica |
|---|---|
| **Demostrar competencia técnica** | El código, los tests, los ADRs y el CI son parte del entregable. Un revisor va a leer el repo, no sólo usar el `.exe`. |
| **Ser un producto usable** | Tiene que arrancar, abrir una carpeta y editar sin crashear. Un demo roto vale menos que un scope chico bien terminado. |

**Regla de oro del proyecto:** ante la duda entre *más features* y *menos features mejor terminadas*, siempre gana lo segundo. Un IDE con 6 features sólidas y 90% de cobertura de tests impresiona más que uno con 20 features a medio hacer.

## Usuarios objetivo

| Persona | Descripción | Necesidad principal |
|---|---|---|
| **P1 — Autor** (vos) | Dev que usa la herramienta a diario para dogfooding | Que no se rompa; feedback loop rápido |
| **P2 — Revisor técnico** | Reclutador senior o tech lead evaluando el portfolio | Leer arquitectura clara, tests, decisiones justificadas |
| **P3 — Early adopter** | Dev curioso que descarga el `.exe` de GitHub Releases | Instalar y editar sin leer documentación |

## Alcance — Dentro (In Scope)

- Editor de código con resaltado de sintaxis, multi-cursor y minimapa
- Explorador de archivos de un workspace (carpeta abierta)
- Terminal integrada (shell nativo del SO)
- Integración LSP (Language Server Protocol) para al menos 3 lenguajes
- Integración DAP (Debug Adapter Protocol) para al menos 1 lenguaje
- Control de versiones Git básico (stage, commit, diff, branch)
- Paleta de comandos y sistema de keybindings configurable
- Sistema de temas (claro/oscuro + temas custom)
- Búsqueda y reemplazo en archivo y en workspace
- API de extensiones documentada con al menos 2 extensiones de ejemplo
- Auto-update y distribución firmada

El detalle está en [Requerimientos funcionales](./03-requerimientos-funcionales.md).

## Alcance — Fuera (Out of Scope)

Documentar lo que **no** se hace es tan importante como lo que sí. Esto evita el scope creep, que es lo que mata a los proyectos de portfolio.

- ❌ Compatibilidad con el marketplace de extensiones de VS Code (implicaría reimplementar toda la API de VS Code)
- ❌ Remote development / SSH / containers
- ❌ Live share / colaboración en tiempo real
- ❌ Notebooks (Jupyter)
- ❌ Integración de IA / autocompletado con LLM *(candidato a Fase 5, no antes)*
- ❌ Soporte para monorepos con múltiples carpetas raíz *(sólo una carpeta raíz por ventana en v1)*
- ❌ Versión web / browser-based
- ❌ Traducción a otros idiomas *(la arquitectura debe soportar i18n, pero sólo se envía `en` y `es`)*

> **Esta lista es un contrato.** Toda feature nueva que quiera entrar requiere sacar otra. Ver [riesgos](./06-roadmap-y-riesgos.md#riesgos-identificados).

## Criterios de éxito

| ID | Criterio | Métrica objetivo |
|---|---|---|
| CE-01 | El IDE arranca rápido | Time-to-interactive < 1.5s en hardware de referencia |
| CE-02 | El editor se siente nativo | Latencia de input < 16ms (p99) |
| CE-03 | El proyecto es creíble como producto | `.exe` firmado, instalable, con auto-update funcional |
| CE-04 | El código es evaluable | Cobertura de tests ≥ 80% en `core`, CI verde, 0 warnings de lint |
| CE-05 | La arquitectura está justificada | ≥ 8 ADRs escritos antes de la v1.0 |

**Hardware de referencia:** CPU de 4 núcleos ~2.5GHz, 8GB RAM, SSD, Windows 11. Todas las métricas de performance se miden acá.

---

[← Guía paso a paso](./00-guia-paso-a-paso.md) · [Índice](./README.md) · [Siguiente: Arquitectura →](./02-arquitectura.md)
