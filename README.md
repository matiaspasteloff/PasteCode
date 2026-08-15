# PasteCode

Un IDE de escritorio liviano y extensible, construido con **Electron + TypeScript + React**.

> **Estado: Fase 0 — Fundaciones.** Hoy la app es una ventana en blanco que muestra
> su nombre y su versión. Eso es exactamente el checkpoint de la Etapa 1: el
> andamio completo —monorepo, TypeScript strict, linting, tests, CI e instalador—
> funcionando de punta a punta antes de escribir la primera feature.
>
> El README que presenta el proyecto, con GIF y capturas, es el paso 41 de la
> [guía](./docs/00-guia-paso-a-paso.md). Este es el README de trabajo.

La documentación completa está en [`PROJECT.md`](./PROJECT.md) y [`docs/`](./docs/).

---

## Requisitos

- **Node.js 24+**
- **pnpm 11+** — `corepack enable pnpm`, o `npm i -g pnpm` si corepack no tiene
  permisos de escritura sobre la carpeta de Node (pasa seguido en Windows)

## Empezar

```bash
pnpm install   # incluye la descarga del binario de Electron
pnpm dev       # levanta la app con HMR
```

## Comandos

| Comando         | Qué hace                                                        |
| --------------- | --------------------------------------------------------------- |
| `pnpm dev`      | La app en modo desarrollo, con HMR                              |
| `pnpm build`    | Compila todos los paquetes                                      |
| `pnpm test`     | Tests unitarios y de integración (Vitest)                       |
| `pnpm test:e2e` | Tests E2E sobre el build de producción (Playwright)             |
| `pnpm check`    | `lint` + `typecheck` + `test` — **correr antes de todo commit** |
| `pnpm package`  | Genera el instalador en `apps/desktop/release/`                 |

## Estructura

```
apps/desktop/       La app Electron: main, preload y renderer
packages/core/      Lógica pura. Sin Electron, sin React, sin I/O
packages/ipc-contract/  Contrato tipado del IPC. Fuente de verdad de los canales
e2e/                Tests E2E con Playwright
docs/               Arquitectura, requerimientos, ADRs y convenciones
```

Las flechas de dependencia van en una sola dirección y no es una recomendación:
está codificado como error de ESLint. Ver
[la regla de dependencias](./docs/02-arquitectura.md#regla-de-dependencias).

---

## Instalar el `.exe`

> **Windows SmartScreen va a mostrar una advertencia.** Es esperable y no indica
> que haya algo malo con el archivo.

PasteCode se distribuye **sin firma de código**. Un certificado cuesta entre USD
200 y 600 por año, y la decisión —registrada en
[build-y-release.md](./docs/convenciones/build-y-release.md#firma-de-código)— fue
empezar sin firmar y evaluarlo si el proyecto gana tracción.

Sin firma, Windows muestra _"Windows protegió su PC"_ al ejecutar el instalador.
Para continuar:

1. Hacé click en **Más información**.
2. Hacé click en **Ejecutar de todas formas**.

Si preferís verificar el archivo antes, cada release publica el `.exe` junto a su
`.blockmap`, y el instalador se construye en el CI a partir del código de este
repositorio: el log del job `build` muestra de qué commit salió.

---

## Licencia

[MIT](./LICENSE) © 2026 Matías Pasteloff
