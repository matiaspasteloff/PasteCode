# PasteCode — Documentación del proyecto

> **Proyecto:** `PasteCode`
> **Tipo:** IDE de escritorio multiplataforma
> **Estado:** Fase 2 — Herramientas de desarrollo (en curso) · Fases 0 y 1 cerradas, falta la primera corrida del CI en GitHub
> **Autor:** Matías Pasteloff
> **Licencia:** MIT
> **Versión de la documentación:** 1.1
> **Última actualización:** 2026-08-15

Este archivo es el punto de entrada. Cada documento vive por separado en [`docs/`](./docs/).

---

## Resumen en 30 segundos

Un IDE de escritorio, liviano y extensible, que ofrece la experiencia central de edición de código de VS Code —edición multi-cursor, autocompletado vía LSP, debugging vía DAP, terminal integrada y control de versiones— con un arranque medible más rápido y una arquitectura de extensiones documentada desde el primer día.

Construido con **Electron + TypeScript + React**, distribuido como `.exe` firmado con auto-update.

---

## Mapa de la documentación

### Producto

| Documento                                                                   | Qué contiene                                                         |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [**Guía paso a paso**](./docs/00-guia-paso-a-paso.md)                       | **Por dónde empezar y en qué orden seguir. Empezá acá.**             |
| [Visión y alcance](./docs/01-vision-y-alcance.md)                           | Objetivos, usuarios, qué entra y qué no, criterios de éxito          |
| [Requerimientos funcionales](./docs/03-requerimientos-funcionales.md)       | RF-001 a RF-911 con prioridad MoSCoW y criterios de aceptación       |
| [Requerimientos no funcionales](./docs/04-requerimientos-no-funcionales.md) | Presupuestos de performance, confiabilidad, seguridad, accesibilidad |
| [Roadmap y riesgos](./docs/06-roadmap-y-riesgos.md)                         | Las 6 fases, sus entregables y los riesgos identificados             |

### Técnica

| Documento                                                   | Qué contiene                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------- |
| [Arquitectura](./docs/02-arquitectura.md)                   | Modelo de procesos, monorepo, reglas de dependencias, patrón de IPC |
| [Modelo de datos y contratos](./docs/05-modelo-de-datos.md) | Estado del workspace, schema de settings, manifest de extensiones   |
| [Decisiones de arquitectura (ADR)](./docs/adr/)             | Registro de decisiones técnicas con sus alternativas descartadas    |
| [Glosario](./docs/07-glosario.md)                           | LSP, DAP, PTY, extension host y demás terminología                  |

### Convenciones de trabajo

| Documento                                                       | Qué contiene                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------- |
| [Reglas de código](./docs/convenciones/codigo.md)               | TypeScript strict, nombres, React, manejo de errores                |
| [Git y control de versiones](./docs/convenciones/git.md)        | Branching, Conventional Commits, PRs, versionado                    |
| [Testing](./docs/convenciones/testing.md)                       | Pirámide de tests, ejemplos por nivel, umbrales de cobertura        |
| [Seguridad](./docs/convenciones/seguridad.md)                   | Hardening de Electron, CSP, validación de rutas, modelo de amenazas |
| [Build y release](./docs/convenciones/build-y-release.md)       | CI, targets de distribución, firma de código, proceso de release    |
| [Definition of Done](./docs/convenciones/definition-of-done.md) | El checklist que cierra toda tarea                                  |

### Para agentes de IA

| Documento                | Qué contiene                                                            |
| ------------------------ | ----------------------------------------------------------------------- |
| [CLAUDE.md](./CLAUDE.md) | Reglas duras, contexto y estilo de trabajo esperado de asistentes de IA |

---

## Regla de oro del proyecto

Ante la duda entre _más features_ y _menos features mejor terminadas_, siempre gana lo segundo. Un IDE con 6 features sólidas y 90% de cobertura de tests impresiona más que uno con 20 features a medio hacer.

---

## Cómo mantener esta documentación

Estos documentos son vivos, no artefactos de arranque que se abandonan.

- **Cambia un requerimiento:** se edita en su archivo, en el mismo PR que lo implementa.
- **Aparece una decisión técnica:** se escribe un ADR en [`docs/adr/`](./docs/adr/) usando la [plantilla](./docs/adr/TEMPLATE.md).
- **Se cierra una fase:** se marcan los checkboxes en el [roadmap](./docs/06-roadmap-y-riesgos.md) y se actualiza la versión acá arriba.
- **Se descubre que un requerimiento era irreal:** se cambia y se anota por qué. Un requerimiento que se ignora en silencio es peor que uno mal escrito.

_Un revisor que lea el historial de Git de esta carpeta debería poder reconstruir cómo evolucionó tu pensamiento sobre el proyecto. Ese historial es, por sí solo, una pieza de portfolio._
