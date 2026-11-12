# PasteCode

Un IDE de escritorio liviano y extensible, construido con **Electron + TypeScript + React**.

> **Estado: Etapa 6 de la guía en curso — Lanzamiento.** Las etapas 1 a 5 están
> cerradas: editor, terminal, búsqueda, sesión, LSP de TypeScript, Git, split
> view, extensiones con su host aislado y debugging por DAP, más el asistente
> de IA como etapa experimental. Esta etapa suma los instaladores para Windows,
> macOS y Linux, los releases con procedencia verificable y el auto-update con
> consentimiento; falta probar un release real de punta a punta.
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

## Atajos

| Atajo          | Qué hace                   |
| -------------- | -------------------------- |
| `Ctrl+S`       | Guarda el archivo activo   |
| `Ctrl+W`       | Cierra la pestaña activa   |
| `Ctrl+Shift+P` | Abre la paleta de comandos |

La paleta lista todos los comandos registrados, incluido el de cambiar el tema.

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

## Instalar

Cada [release](https://github.com/matiaspasteloff/PasteCode/releases) trae un
instalador por plataforma, `SHA256SUMS.txt` y una attestation de procedencia.

| Sistema               | Archivo                                                                 |
| --------------------- | ----------------------------------------------------------------------- |
| Windows x64           | `PasteCode-<versión>-win-x64-setup.exe`, o `-portable.exe` sin instalar |
| Windows arm64         | `PasteCode-<versión>-win-arm64-setup.exe`                               |
| macOS (Apple Silicon) | `PasteCode-<versión>-mac-arm64.dmg`                                     |
| macOS (Intel)         | `PasteCode-<versión>-mac-x64.dmg`                                       |
| Linux x64             | `PasteCode-<versión>-linux-x86_64.AppImage` o `-linux-amd64.deb`        |

PasteCode se distribuye **sin firma de código**. Un certificado cuesta entre USD
200 y 600 por año, y la decisión —registrada en
[build-y-release.md](./docs/convenciones/build-y-release.md#firma-de-código)— fue
empezar sin firmar y evaluarlo si el proyecto gana tracción. Por eso los
sistemas avisan la primera vez.

### Windows

> **Windows SmartScreen va a mostrar una advertencia.** Es esperable y no indica
> que haya algo malo con el archivo.

El instalador es de un click: no pregunta nada ni pide permisos de
administrador. Sin firma, Windows muestra _"Windows protegió su PC"_. Para
continuar:

1. Hacé click en **Más información**.
2. Hacé click en **Ejecutar de todas formas**.

### macOS

La app lleva firma ad-hoc pero no está notarizada, así que Gatekeeper avisa que
no puede verificar al desarrollador. Arrastrá PasteCode a Aplicaciones y la
primera vez abrila con **click derecho → Abrir → Abrir**. Si macOS dice que la
app "está dañada", es la cuarentena de la descarga:

```bash
xattr -dr com.apple.quarantine /Applications/PasteCode.app
```

### Linux

El AppImage no se instala: se le da permiso de ejecución y se abre.

```bash
chmod +x PasteCode-*-linux-x86_64.AppImage
./PasteCode-*-linux-x86_64.AppImage
```

El `.deb` se instala con `sudo apt install ./PasteCode-*-linux-amd64.deb`.

### Verificar lo que bajaste

```bash
sha256sum --check --ignore-missing SHA256SUMS.txt
gh attestation verify PasteCode-<versión>-win-x64-setup.exe --repo matiaspasteloff/PasteCode
```

La attestation prueba que el archivo salió del workflow de release de este
repositorio, en el commit del tag.

### Actualizaciones

PasteCode busca versiones nuevas al arrancar (se apaga con
`update.checkOnStartup: false` en `~/.pastecode/settings.json`) y **nunca
descarga ni instala nada sin que lo pidas**. En Windows x64 y en el AppImage la
actualización se descarga e instala desde la barra de estado; en macOS, en
Windows arm64, en el portable y en el `.deb`, la app avisa y abre la página de
la versión nueva.

---

## Licencia

[MIT](./LICENSE) © 2026 Matías Pasteloff
