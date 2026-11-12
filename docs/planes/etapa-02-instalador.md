# Etapa 2 — Instalador y releases multiplataforma

[← Etapa 1](./etapa-01-hardening.md) · [Planes de ejecución](./README.md) · [Siguiente: confianza →](./etapa-03-confianza.md)

**Rama:** `claude/ide-exponential-improvements-mh7gtv-e2` · **PR contra:** `claude/ide-exponential-improvements-mh7gtv-e1`

## Objetivo

Que PasteCode se pueda instalar. Hoy hay un solo destino —NSIS para Windows x64, con asistente—, sale sin ícono y sin las extensiones de ejemplo, y no existe ni un release ni una forma de actualizar. Al terminar:

- Un tag `v*` produce un release en borrador con instaladores para Windows (x64 y arm64, de un click y portable), macOS (`.dmg`, arm64 y x64) y Linux (AppImage y `.deb`), con checksums y attestation de procedencia.
- La app avisa cuando hay una versión nueva y **nunca** descarga ni instala sin que la persona lo pida.
- La app arranca en macOS y Linux, no sólo en Windows.

Cierra los hallazgos S7 y D1 a D6 del [informe](../informes/2026-11-auditoria.md).

## Leer antes

- [`docs/convenciones/build-y-release.md`](../convenciones/build-y-release.md) — se reescribe acá.
- `apps/desktop/electron-builder.yml` entero, con sus comentarios: explican por qué `files` excluye `node_modules` y qué se vuelve a incluir.
- [ADR-0014](../adr/0014-node-pty-con-binarios-precompilados.md), [ADR-0007](../adr/0007-ripgrep-como-binario-externo.md), [ADR-0027](../adr/0027-empaquetado-y-fork-del-extension-host.md), [ADR-0030](../adr/0030-barra-de-titulo-propia.md).
- Las notas de la etapa 1 en [`PROGRESO.md`](./PROGRESO.md), sobre todo qué pasó con los fuses.

---

## Tareas

### T1 — Las extensiones de ejemplo viajan en el instalador

`main/extensions/directories.ts` busca las extensiones incorporadas en `process.resourcesPath/extensions` cuando la app está empaquetada. `electron-builder.yml` no tiene `extraResources`, así que esa carpeta no existe en la app instalada.

- Agregá `extraResources` que copie a `extensions/`:
  - de `extensions/theme-nord`: `package.json` y `themes/**`;
  - de `extensions/word-count`: `package.json` y `dist/**`, sin los `.map`.
- **`word-count` hay que compilarla antes.** Su `main` es `./dist/extension.js` y `dist/` sale de `tsc -p tsconfig.build.json`. En `turbo.json`, `package` depende de `build` del propio paquete, y `word-count` no es dependencia de `apps/desktop`: en un checkout limpio nada garantiza que esté compilada. Arreglalo en el grafo de Turbo, no con un `sleep` ni asumiendo el orden.
- `word-count` importa `@pastecode/extension-api` sólo como tipos. Confirmá que el `dist/extension.js` emitido no tiene ningún `import` de runtime: en la app instalada no hay `node_modules` para resolverlo.

### T2 — Ícono

No existe `apps/desktop/build/`. Creá:

- `apps/desktop/build/icon.svg` — la fuente. Un diseño simple: fondo de esquinas redondeadas en el violeta de acento del tema oscuro (`#b4a0ff` sobre `#0f1117`, ver `tokens.css`) y un glifo que se lea a 16px.
- `apps/desktop/build/icon.png` — 1024×1024, rasterizado desde el SVG. Playwright ya está en el repo y sirve para eso; no hace falta una dependencia nueva. Verificá en el schema de electron-builder qué acepta como ícono en cada plataforma y si deriva `.ico` e `.icns` de un PNG; si no los deriva, generalos.

En Linux la ventana necesita además `icon` en las opciones del `BrowserWindow`.

### T3 — Destinos de `electron-builder.yml`

| Plataforma | Destinos            | Notas                                                                              |
| ---------- | ------------------- | ---------------------------------------------------------------------------------- |
| Windows    | `nsis` + `portable` | `nsis.oneClick: true`, `perMachine: false`. Un click, sin asistente, sin elevación |
| macOS      | `dmg` + `zip`       | Sin firma. `category: public.app-category.developer-tools`                         |
| Linux      | `AppImage` + `deb`  | `category: Development`                                                            |

- La arquitectura la elige la línea de comandos de cada job (`--x64`, `--arm64`), no el YAML.
- `artifactName` uniforme: `PasteCode-${version}-${os}-${arch}.${ext}`, con sufijo `-setup` para NSIS y `-portable` para el portable. Verificá las macros en el schema.
- `allowToChangeInstallationDirectory` no convive con `oneClick: true`: sacalo.
- El script `package` de `apps/desktop/package.json` deja de forzar `--win`: empaqueta para la plataforma en la que corre.
- **`deb` exige un mantenedor con email.** No inventes ni busques un email personal del autor: usá `matiaspasteloff@users.noreply.github.com` y dejalo anotado en `PROGRESO.md` como algo que el autor puede querer cambiar.
- Conservá el estilo del archivo: cada decisión con su comentario de por qué.

### T4 — Que la app arranque fuera de Windows

**La plataforma en el renderer.** Hoy el renderer no sabe en qué sistema corre. Agregá `platform` a `PasteCodeApi` en `packages/ipc-contract/src/api.ts` —`'win32' | 'darwin' | 'linux'`—, llenalo en el preload desde `process.platform`, y actualizá `renderer/test-support/fake-api.ts`. Es una propiedad y no un canal porque se necesita antes del primer render, para no parpadear.

**Botones de ventana.** `WindowControls.tsx` dibuja glifos de _Segoe Fluent Icons_, que sólo existe en Windows. Reemplazalos por SVG inline, con el molde de `components/icons/`. Los `data-testid` y los `aria-label` no cambian.

**macOS.**

- `titleBarStyle: 'hidden'` en vez de `frame: false`, para conservar el semáforo nativo. Verificá las opciones en `electron.d.ts`.
- En `darwin`, `WindowControls` no se dibuja y la barra de título deja espacio a la izquierda para el semáforo.
- El menú mínimo por roles ya lo dejó la etapa 1.
- **Atajos:** en macOS la tecla es `Cmd`, no `Ctrl`. Mirá cómo `features/commands/key-combination.ts` arma la combinación y hacé que en `darwin` `metaKey` cuente como `ctrl`; `shortcut-label.ts` muestra `⌘`. Con tests.

**Linux.** `frame: false` funciona. Verificá que `resolveShell` sin configuración use un `$SHELL` absoluto y que caiga a `/bin/sh` si no.

**Smoke en CI.** Un job nuevo que corra `e2e/tests/smoke.spec.ts` en `ubuntu-latest` (con `xvfb-run`) y en `macos-latest`. Sólo el smoke: el resto de la suite asume PowerShell.

RNF-27 y RNF-28 declaran macOS "soportada" y Linux "best effort". El objetivo de esta tarea es **que arranque y se pueda usar**, no la paridad con Windows. Lo que quede roto y no entre, va a `PROGRESO.md` con nombre y apellido.

### T5 — Workflow de empaquetado

**`.github/workflows/package.yml`**, reutilizable (`on: workflow_call`), con esta matriz:

| Runner           | Arquitectura | Qué construye    |
| ---------------- | ------------ | ---------------- |
| `windows-latest` | x64          | NSIS + portable  |
| `windows-11-arm` | arm64        | NSIS             |
| `macos-latest`   | arm64        | `dmg` + `zip`    |
| Intel de macOS   | x64          | `dmg` + `zip`    |
| `ubuntu-latest`  | x64          | AppImage + `deb` |

Runners nativos por arquitectura, a propósito: node-pty y ripgrep vienen como binarios precompilados por plataforma, y construir cada uno donde corresponde evita toda la compilación cruzada.

**Verificá las etiquetas de runner contra la documentación actual de GitHub** antes de escribirlas. La de macOS Intel es la más inestable: si la etiqueta que encontrás no existe, el job queda en cola para siempre. Si no hay runner Intel gratuito, construí el x64 de macOS en el runner arm64 con `--x64` y verificá con `verify-package` que trae los binarios nativos de x64.

Cada job: instala, `pnpm build`, empaqueta con `--publish never`, corre las dos verificaciones de abajo y sube los artefactos (instaladores, `*.yml` de actualización y `*.blockmap`).

**`scripts/verify-package.mjs`** — recibe el directorio desempaquetado, la plataforma y la arquitectura, y falla si falta algo de esto:

- el binario de ripgrep, de esa plataforma y arquitectura;
- el `.node` de node-pty, de esa plataforma y arquitectura;
- `typescript-language-server/lib/cli.mjs`;
- `resources/extensions/theme-nord/package.json` y `resources/extensions/word-count/dist/extension.js`;
- y que **no** haya binarios nativos de otra arquitectura.

**`scripts/check-installer-size.mjs`** — reemplaza el paso de PowerShell de `ci.yml`. Escribe la fila en `$GITHUB_STEP_SUMMARY` para cada artefacto. El techo de RNF-05 (120MB) se hace cumplir para Windows; para macOS y Linux se **mide y se reporta**, y el techo se propone en la documentación con el primer número real.

**`ci.yml`**: el job `build` pasa a ser `uses: ./.github/workflows/package.yml`. Agregá `knip` para los scripts nuevos si hace falta.

### T6 — Workflow de release

**`.github/workflows/release.yml`**, disparado por tags `v*`:

1. Verifica que el tag coincida con `version` de `apps/desktop/package.json`. Si no, falla antes de construir nada.
2. Llama a `package.yml`.
3. Un job final que baja todos los artefactos, genera `SHA256SUMS.txt`, emite la attestation de procedencia (el repositorio es público, así que es gratis) y crea el release **en borrador**. Un tag con sufijo (`-beta.1`) se marca como prerelease.

Permisos mínimos, declarados por job. El borrador es deliberado: [`build-y-release.md`](../convenciones/build-y-release.md) pide notas legibles por un humano, y publicar es decisión del autor.

**Dos Windows, un `latest.yml`.** Los jobs de x64 y de arm64 generan cada uno su `latest.yml`, y en el release hay lugar para uno. Subí el de x64. El de arm64 no se publica: esa variante avisa de versiones nuevas pero no se actualiza sola (ver T7).

**No empujes ningún tag para probarlo.** Lo que podés verificar es que `package.yml` corre en el PR. El primer release real lo dispara el autor.

### T7 — Auto-update con consentimiento

Dependencia nueva: `electron-updater`. Justificación para el PR (regla 4): resuelve la descarga, la verificación por sha512 y la instalación en NSIS y AppImage, que a mano serían cientos de líneas de código de seguridad sin testear; pesa del orden de 1MB en el asar contra 22MB de margen de RNF-05; lo mantiene el mismo equipo que `electron-builder`. Confirmá la fecha de su último release al instalarlo.

**Contrato primero** — `packages/ipc-contract/src/schemas/update.ts`:

| Canal             | Para qué                                       |
| ----------------- | ---------------------------------------------- |
| `update:getState` | El estado actual                               |
| `update:check`    | Buscar ahora                                   |
| `update:download` | Descargar la versión disponible. Sólo a pedido |
| `update:install`  | Cerrar e instalar lo descargado                |

Evento `update:stateChanged`. El estado es una unión discriminada: `idle`, `checking`, `up-to-date`, `available`, `downloading` (con porcentaje), `downloaded`, `error`, `unsupported`. Lleva la versión actual, la nueva si hay, la URL del release, y `canInstallInApp`.

**Lógica pura** — `packages/core/src/update/`, con tests:

- El reductor del estado.
- `canInstallInApp(…)`: `true` sólo para Windows x64 instalado por NSIS y para AppImage. `false` para macOS (Squirrel.Mac exige firma), Windows arm64 (ver T6), el portable, `deb` y la app sin empaquetar.
- La URL de la página del release.

**Main** — `main/services/updater.ts` y `main/ipc/update.ts`:

- Un adaptador fino sobre el `autoUpdater` de `electron-updater`, **detrás de una interfaz propia** para que los tests no dependan de la librería. Verificá en sus tipos los nombres de propiedades y eventos.
- `autoDownload = false` y `autoInstallOnAppQuit = false`. Es la regla del proyecto: nunca sin consentimiento.
- El primer chequeo va **diferido**, varios segundos después de que la ventana se muestra, para no tocar RNF-01. Sólo si `update.checkOnStartup` lo permite.
- Cuando `canInstallInApp` es `false`, la acción que se ofrece es abrir la página del release con `shell.openExternal`, que ya pasa por `isSafeExternalUrl`.
- Sin empaquetar, el estado es `unsupported` y no se hace ninguna llamada de red.

**Settings** — grupo nuevo `update`: `checkOnStartup` (booleano, por omisión `true`) y `channel` (`stable` o `beta`). **El grupo entero es sólo de usuario**: un repositorio no puede elegir de qué canal se actualiza el IDE. Seguí el molde de `userOnlyDebug` en `packages/core/src/settings/merge.ts`, con tests. Documentalo en `05-modelo-de-datos.md`.

**Renderer:** `stores/update-store.ts`; `components/status/StatusUpdate.tsx`, visible sólo cuando hay algo que decir; comandos `app.checkForUpdates`, `app.downloadUpdate`, `app.installUpdate` y `app.openReleasePage`; textos en `i18n/es.ts`.

**Empaquetado:** `files` excluye todo `node_modules`. `electron-updater` tiene que llegar al asar igual: lo más simple es que Vite lo bundlee en `out/main`, sumándolo a `BUNDLED_DEPENDENCIES` en `electron.vite.config.ts` como ya se hace con `chokidar`. El smoke del E2E corre sobre `out/` y es lo que avisa si el bundle quedó roto.

**Tests:**

- `core`: el reductor y `canInstallInApp`, por tabla.
- main: el servicio contra un updater falso — que nunca descarga solo, que traduce cada evento, que un error no tumba nada.
- E2E `update.spec.ts`: en el build sin empaquetar, `app.checkForUpdates` deja un estado `unsupported` visible y accionable.

### T8 — Documentación

- **`docs/convenciones/build-y-release.md`**, reescrito a lo que existe: el esquema de CI real, la tabla de destinos real (dos `.dmg` y no uno universal notarizado), y el proceso de release sin `changesets` —subir la versión, actualizar el `CHANGELOG`, tag, revisar el borrador, publicar—. La sección de firma suma cómo verificar la attestation.
- **`CHANGELOG.md`** en la raíz, formato _Keep a Changelog_, con una sección "Sin publicar" que liste lo de las etapas 1 y 2.
- **`README.md`**: instalación por plataforma, con el aviso de SmartScreen que ya está, el equivalente de Gatekeeper para macOS y el `chmod +x` del AppImage. De paso, corregí el estado, que dice "Etapa 2 cerrada".
- **`docs/adr/0034-distribucion-multiplataforma-y-auto-update.md`**: runners nativos contra compilación cruzada, un click contra asistente, por qué macOS y Windows arm64 sólo avisan, y por qué attestation en vez de firma.
- **Requerimientos:** RNF-05 con la medición por plataforma; RNF-26 a RNF-28 con su estado; el paso 38 de la guía y los checkboxes de la Fase 5 del roadmap —el código de auto-update está, **su verificación con un release real no**, y se dice así—.
- **`PROGRESO.md`**.

**No subas la versión de `apps/desktop/package.json`.** Eso es parte de publicar, y publicar es del autor.

---

## Criterios de aceptación

1. Los cuatro comandos de verificación pasan, y el CI del PR está en verde.
2. La matriz de `package.yml` produce un artefacto por fila, y `verify-package` pasa en cada una.
3. El instalador de Windows es de un click y trae ícono propio.
4. `verify-package` demuestra que las dos extensiones de ejemplo viajan en el paquete.
5. El smoke pasa en Ubuntu y en macOS.
6. `release.yml` existe, valida el tag y crea un borrador. No se ejecutó: se dice.
7. Ningún camino de código descarga o instala una actualización sin una acción explícita.
8. `build-y-release.md` no describe nada que no exista.
9. ADR-0034 escrito e indexado.

## Trampas

- **`update:install` y el apagado.** `main/index.ts` cancela `before-quit` para matar a los procesos hijo antes de salir (RNF-10). Instalar una actualización también cierra la app: verificá que los dos caminos no se pisen, y que al instalar los hijos mueran igual.
- **RNF-04 tiene 3,2MB de margen.** `electron-updater` se carga en el main: medí con `pnpm perf` si tu entorno puede, o mirá el comentario del job de performance en el PR. Si el presupuesto se pasa, cargalo con `import()` diferido; no subas el techo.
- **`knip` falla por dependencias sin usar y por archivos sin referenciar.** Los scripts nuevos de `scripts/` ya entran por el `entry` de la raíz.
- **El hoisting de pnpm.** `nodeLinker: hoisted` hace que un paquete funcione aunque no esté declarado. Declará lo que uses.
- **Cada job de empaquetado tarda minutos.** No iteres a ciegas contra el CI: probá `electron-builder --dir` en tu entorno primero, si corre.

## Pendiente del autor

- Empujar `v0.4.0-beta.1`, revisar el borrador y publicarlo.
- Instalar en Windows, macOS y Linux de verdad.
- Publicar `v0.4.0-beta.2` y comprobar la actualización de punta a punta.
