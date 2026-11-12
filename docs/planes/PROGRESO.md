# Progreso de los planes

[← Planes de ejecución](./README.md)

> Lo actualiza la sesión que ejecuta cada etapa. Es lo primero que lee la siguiente.

## Estado

| #   | Etapa                                      | Estado                       | PR  |
| --- | ------------------------------------------ | ---------------------------- | --- |
| 0   | Informe y planes                           | hecha                        | —   |
| 1   | Hardening de Electron                      | hecha con criterios abiertos | —   |
| 2   | Instalador y releases multiplataforma      | hecha con criterios abiertos | #26 |
| 3   | Modelo de confianza                        | pendiente                    | —   |
| 4   | Deuda barata, tipografías e idioma         | pendiente                    | —   |
| 5   | Diseño I: estructura                       | pendiente                    | —   |
| 6   | Diseño II: superficies nuevas              | pendiente                    | —   |
| 7   | Emulador de Android I: control             | pendiente                    | —   |
| 8   | Emulador de Android II: pantalla y modelos | pendiente                    | —   |
| 9   | IDE I: lenguaje y búsqueda                 | pendiente                    | —   |
| 10  | IDE II: Git, debug e IA                    | pendiente                    | —   |
| 11  | Cierre de la Fase 5                        | pendiente                    | —   |

Estados válidos: `pendiente`, `en curso`, `hecha`, `hecha con criterios abiertos`, `bloqueada`.

## Entorno

> Lo llena la etapa 1, en su tarea 0, y lo corrige cualquier etapa que encuentre algo distinto. La idea es que nadie redescubra qué corre en el contenedor de la nube.

Antes de cualquier comando, dos variables. El contenedor trae **Node 22** primero en el `PATH`, y el repo pide `>=24` (`engines`); hay un Node 24 instalado al lado. Y ESLint se queda sin heap con el límite por omisión:

```bash
export PATH=/opt/node24/bin:$PATH
export NODE_OPTIONS=--max-old-space-size=8192
```

| Comando                          | ¿Corre en la nube? | Notas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | sí                 | 4–15 s con el store caliente. Con Node 22 avisa `Unsupported engine` y sigue. **Con la caché de Electron fría, la descarga del binario falla a veces** con `AssertionError [ERR_ASSERTION]: assert(!this.paused)` en el `postinstall` de `apps/desktop`; volver a correr `pnpm install` lo resuelve                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `pnpm check`                     | sí, con más heap   | ~1 min 45 s. Sin `NODE_OPTIONS=--max-old-space-size=8192`, `eslint .` muere a los ~60 s con `FATAL ERROR: Ineffective mark-compacts near heap limit` (exit 134)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `pnpm format:check`              | sí                 | ~8 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `pnpm knip`                      | sí                 | ~3 s. Deja un _configuration hint_ (`src/renderer/main.tsx` es una entrada redundante en `knip.jsonc`) que no falla                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `pnpm coverage`                  | sí                 | ~40 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `pnpm build`                     | sí                 | ~10 s sin caché de Turbo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `pnpm test:e2e`                  | sí, con `xvfb-run` | `xvfb-run -a pnpm test:e2e`, ~90 s. Línea base: 63 pasan y 1 se saltea (el del asar, que pide un build empaquetado); al cerrar la etapa 1, 66 y 1. El spec del asar busca `release-unfused/win-unpacked/PasteCode.exe`: en Linux no existe y se saltea solo. Para correrlo acá hay que apuntarlo a mano al paquete de Linux (ver las notas de la etapa 1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `pnpm package`                   | no (sólo a medias) | Por Turbo falla con `self-signed certificate in certificate chain`: Turbo filtra las variables de entorno y `NODE_EXTRA_CA_CERTS`, que apunta al CA del proxy de la nube, no llega a electron-builder. Corriendo el script del paquete sin Turbo (`pnpm --filter @pastecode/desktop package`) llega a armar `release/win-unpacked/` y falla en el NSIS con `spawn wine ENOENT`: no hay Wine. **Lo que sí anda**, desde `apps/desktop` y sin Turbo: `npx electron-builder --linux --dir --config electron-builder.yml` (~1 min), que arma `release/linux-unpacked/` con los fuses grabados. Borrá `release/` y `release-unfused/` cuando termines. **Desde la etapa 2**, `npx electron-builder --linux --x64 --config electron-builder.yml --publish never` arma también el AppImage y el `.deb` (~2 min), y el ejecutable se llama `pastecode`. `node scripts/verify-package.mjs apps/desktop/release/linux-unpacked linux x64` verifica el paquete |

## Notas por etapa

Cada etapa agrega su sección acá abajo, con este formato:

```markdown
### Etapa N — nombre

**Criterios de aceptación:** cuáles se cumplieron y cuáles quedaron abiertos, con el motivo.

**Lo que salió distinto de lo previsto:** qué decía el plan y qué hubo que hacer en cambio. Incluye toda API que el plan nombraba y no existía.

**Lo que la etapa siguiente tiene que saber.**

**Pendiente del autor:** lo que sólo se puede verificar a mano.
```

### Etapa 1 — Hardening de Electron

**Criterios de aceptación:**

| #   | Criterio                                                       | Estado      | Motivo                                                                                                                                                                                                                                                                                                            |
| --- | -------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `check`, `format:check`, `knip`, `coverage` pasan              | cumplido    | Los cuatro en verde en el contenedor sobre la punta de la rama, y `pnpm audit --audit-level=high` también                                                                                                                                                                                                         |
| 2   | CI del PR en verde, con E2E y presupuestos                     | **abierto** | La sesión no abre el PR, así que no vio el CI. El E2E corre en verde en Linux con `xvfb-run` (66 pasan, 1 se saltea); falta Windows y los presupuestos de performance                                                                                                                                             |
| 3   | CSP con `form-action 'none'` y `frame-ancestors 'none'`        | cumplido    | En producción y en desarrollo, con test                                                                                                                                                                                                                                                                           |
| 4   | `security.spec.ts`: permiso, `window.open`, navegación externa | cumplido    | Los tres. Se comprobó que fallan sin el código: sin la política, geolocalización, micrófono y notificaciones dan `granted`; sin la guarda, la ventana termina en `https://example.com`                                                                                                                            |
| 5   | Ningún archivo repite la lógica de navegación                  | cumplido    | `create-window.ts` ya no tiene `will-navigate` ni `setWindowOpenHandler`. "Qué origen es la app" vive sólo en `security/url-origin.ts`, que usan la navegación y los permisos                                                                                                                                     |
| 6   | Zoom funciona y persiste en `settings.json`                    | cumplido    | E2E en `session.spec.ts`: _Acercar_ desde la paleta, `getZoomLevel()` del main en 0,5, `settings.json` con `window.zoomLevel: 0.5`, y el zoom vuelve al reabrir                                                                                                                                                   |
| 7   | Fuses declarados, `runAsNode` como excepción                   | cumplido    | Verificado leyendo los fuses del binario de `electron-builder --linux --dir` con `@electron/fuses read`                                                                                                                                                                                                           |
| 8   | `seguridad.md` sin afirmaciones que el código contradiga       | cumplido    | Además de lo que pedía el plan, se corrigieron dos que nadie había listado: `terminal.shell` **no** pide confirmación la primera vez, y no es la única clave que el workspace no puede escribir. Los dos bloques de código ilustrativos (validación de rutas y de IPC) ahora dicen cuál es la implementación real |
| 9   | ADR-0033 escrito e indexado                                    | cumplido    |                                                                                                                                                                                                                                                                                                                   |

**Lo que salió distinto de lo previsto:**

- **T0b, el pin de Vite.** El plan pedía no mover `vite` 7.3.6, pero 7.3.6 tiene un aviso alto (GHSA-587h-7wmj-h5pm, en el `launch-editor` que Vite trae adentro) con parche en 7.3.7, y el mismo plan prohíbe silenciar un aviso que tiene parche. Las dos instrucciones no se podían cumplir juntas. Se subió a **7.3.7**: lo que ADR-0009 protege es el peer `^7` de `electron-vite`, que el parche respeta. Quedó anotado en ADR-0009 (sección _Actualización_) y en el `//pins` de `package.json`. Si el autor prefiere el pin exacto, la alternativa es ignorar ese GHSA en `auditConfig` con su motivo (es un dev server, no llega al instalador).
- **T0b, `dompurify`.** Es el único aviso crítico y el único que llega al instalador: `monaco-editor` lo fija exacto, y ni la 0.56.0 que usamos ni la 0.57.0 (la última) traen la versión arreglada. Va por `overrides` en `pnpm-workspace.yaml`, con el aviso al lado.
- **T0b, transitivas.** `pnpm update --depth Infinity <paquete>` no refrescó las que cuelgan de `electron-builder` (undici 6, fast-uri, @xmldom/xmldom, js-yaml, brace-expansion) aunque sus rangos lo permitían. Se forzó la re-resolución con overrides temporales y se sacaron: el lockfile se quedó con las versiones nuevas y no queda ningún override más que el de `dompurify`.
- **T0b, efecto en el bundle.** `zod` 4.6.7 pesa más que 4.4.3: el preload pasó de 184 a 227 KB y el chunk del manifest del main de 193 a 238 KB. Rollup avisa que descarta anotaciones `@__PURE__` de zod. No hay presupuesto de tamaño de bundle, pero RNF-01 (arranque) se mide en el CI de Windows: si salta, mirar acá primero.
- **T3, firma de `applyPermissionPolicy`.** El plan la daba como `(session, devServerOrigin)`. Quedó `(session, appOrigin, devServerOrigin)`, igual que `installWebContentsGuard`, para no importar `APP_ORIGIN` desde `security/` y poder testear el cableado con una sesión falsa. Recibe una interfaz mínima (`PermissionSession`) que `Session` cumple estructuralmente.
- **T3, allow-list.** No se dejó vacía aunque el E2E pase así: el _Pegar_ del menú contextual de Monaco usa `navigator.clipboard.readText()` (verificado en `monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard.js`), y ningún E2E abre ese menú. Que la suite pase con la lista vacía no prueba nada.
- **T3, `getUserMedia`.** En el contenedor rechaza haya o no política, porque no hay micrófono. Por eso el E2E también consulta `navigator.permissions.query({ name: 'microphone' })`, que es la aserción que de verdad distingue.
- **T4, la URL de la navegación.** `will-navigate` y `will-redirect` en Electron 43 traen la URL en `details.url`; el segundo argumento del listener está marcado `@deprecated`. Se usa `details.url`.
- **T4, Playwright y la navegación cancelada.** Después de un `location.href` que se cancela, `window.url()` y cualquier locator se quedan esperando una navegación que nunca termina. El E2E lee la URL desde el main con `webContents.getURL()`.
- **T5, el "a confirmar" de S5 sigue sin confirmar.** Se probó apretar `Ctrl+Shift+I` y `Ctrl+R` con Playwright, con y sin el menú por omisión: ninguno de los dos disparó nada en ninguno de los dos casos. Los eventos sintetizados por CDP no llegan a los aceleradores del menú nativo, así que la prueba no distingue. Ningún spec del E2E dependía de un acelerador del menú: la suite completa pasa sin él.
- **T6, atajo de acercar.** Además de `ctrl+=` va `ctrl+shift+=`: los atajos se comparan contra `event.key`, y en un teclado español el `=` sale con Shift.
- **T6, cuándo se aplica el zoom.** `updateSettings` del main no llama al `onChange` (sólo lo hace el watcher, con debounce), así que el zoom se aplica en el broadcast **y** después de cada `settings:update`. Al crear la ventana se aplica en `did-finish-load`.
- **T7, el bloqueo y el E2E.** El plan lo desactiva bajo `PASTECODE_E2E_HOME`, pero la mayoría de los specs no setean esa variable: para ellos el bloqueo **sí** se pide, y la suite pasa porque corre con `workers: 1`. Si algún día se paraleliza, esos specs necesitan su propio `PASTECODE_E2E_HOME`.
- **T8, `electronFuses`.** Existe en el `scheme.json` instalado con las siete claves del plan, así que no hizo falta el hook `afterPack` ni `@electron/fuses` como dependencia. `electron-builder.unfused.yml` usa `extends: electron-builder.yml`; se verificó que hereda `files` y `asarUnpack` y cambia sólo la salida y el fuse.
- **T8, verificación.** Se empaquetaron en el contenedor los dos, para Linux: el fused arranca y el E2E del asar no llega a conectarse (Playwright no puede adjuntarse sin `--inspect`); el unfused arranca y el E2E del asar pasa. Es la primera vez que ese test corre contra un paquete en este proyecto fuera de Windows.
- **T9, `SECURITY.md`.** Remite al _private vulnerability reporting_ de GitHub. **Hay que activarlo** en la configuración del repositorio, o el botón no aparece.

**Lo que la etapa siguiente tiene que saber:**

- Antes de cualquier comando: `export PATH=/opt/node24/bin:$PATH NODE_OPTIONS=--max-old-space-size=8192`. Ver la tabla de entorno.
- `pnpm package` por Turbo no anda en la nube. Para la etapa 2, que toca el instalador: desde `apps/desktop`, `npx electron-builder --linux --dir --config electron-builder.yml` sí anda y deja leer los fuses con `node ../../node_modules/@electron/fuses/dist/bin.js read --app release/linux-unpacked/@pastecodedesktop`. El ejecutable de Linux se llama `@pastecodedesktop` porque no hay `executableName`: probablemente la etapa 2 quiera fijarlo.
- `electron-builder.yml` tiene ahora un bloque `electronFuses`, y `electron-builder.unfused.yml` lo repite entero, para no depender de cómo `extends` mezcla los objetos anidados (no se probó con un bloque parcial). **Un fuse que se cambie en uno se cambia en el otro.**
- Para correr el E2E del asar contra el paquete de Linux hay que apuntar `PACKAGED_APP` (`e2e/tests/support/desktop.ts`) a `release-unfused/linux-unpacked/@pastecodedesktop`. Se hizo a mano y se revirtió; hacerlo multiplataforma es trabajo de la etapa 2.
- La regla "qué origen es la app" está en `security/url-origin.ts`. Cualquier política nueva por origen la usa; no se escribe otra.
- Flaky visto una vez en una docena de corridas completas de `pnpm check`: `src/main/lsp/client.test.ts`, test _"marca failed al servidor que negocia un encoding que no es utf-16"_, con un `ERR_STREAM_DESTROYED` no atrapado (`Cannot call write after a stream was destroyed`) que Vitest reporta como error de la corrida. No se reprodujo en ocho corridas aisladas. No es de esta etapa —el cliente LSP no se tocó— pero está ahí: es una escritura en el stdin de un servidor que ya se cerró al rechazar el encoding. Le toca a la etapa 9.
- Quedan 2 avisos moderados en `pnpm audit` (`smol-toml` y `minimatch` 10), que no bloquean.

**Pendiente del autor:**

- Ver el CI del PR, sobre todo el E2E de Windows y RNF-01 (el preload creció ~44 KB por zod).
- Activar _private vulnerability reporting_ en el repositorio para que `SECURITY.md` funcione.
- Probar en Windows, con la app instalada, que `Ctrl+Shift+I` y `Ctrl+R` ya no hacen nada, y que _Pegar_ desde el menú contextual del editor sigue andando.
- Probar en macOS que `Cmd+C`/`Cmd+V` andan con el menú mínimo.
- Decidir si el pin de Vite en 7.3.7 está bien o si prefiere 7.3.6 con el aviso ignorado.

### Etapa 2 — Instalador y releases multiplataforma

**Criterios de aceptación:**

| #   | Criterio                                                        | Estado                       | Motivo                                                                                                                                                                                                      |
| --- | --------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Los cuatro comandos pasan y el CI del PR está en verde          | cumplido                     | Los cuatro en verde en el contenedor. CI de #26 en verde sobre `5e08f6a`, con una salvedad: `Tests (macos-latest)` necesitó dos re-corridas por un timeout del watcher en `keybindings.test.ts` (ver abajo) |
| 2   | La matriz produce un artefacto por fila y `verify-package` pasa | cumplido                     | Las cinco filas en verde; `verify-package` revisó 13 binarios nativos en cada Windows, 18 en cada macOS y 10 en Linux, todos de su arquitectura                                                             |
| 3   | El instalador de Windows es de un click y trae ícono propio     | cumplido en la configuración | `nsis.oneClick: true`, `perMachine: false`, `icon: build/icon.png` (electron-builder deriva el `.ico`). Que se vea así en una máquina real es del autor                                                     |
| 4   | `verify-package` demuestra que viajan las dos extensiones       | cumplido                     | Lo exige en las cinco filas; en el contenedor, contra el paquete de Linux, también                                                                                                                          |
| 5   | El smoke pasa en Ubuntu y en macOS                              | cumplido                     | Job `smoke` en `ubuntu-latest` (con `xvfb-run`) y `macos-latest`, en verde desde su primera corrida                                                                                                         |
| 6   | `release.yml` existe, valida el tag y crea un borrador          | cumplido, **sin ejecutar**   | No se empujó ningún tag. Lo verificable en el PR es `package.yml`, que es lo que llama. `merge-update-info.mjs` se probó a mano                                                                             |
| 7   | Ningún camino descarga o instala sin una acción explícita       | cumplido                     | `autoDownload` y `autoInstallOnAppQuit` en `false` (test del adaptador), y el servicio sólo descarga/instala desde `update:download`/`update:install`, que sólo llaman los comandos (tests del servicio)    |
| 8   | `build-y-release.md` no describe nada que no exista             | cumplido                     | Reescrito: sin `changesets`, sin `.dmg` universal notarizado, con el CI real                                                                                                                                |
| 9   | ADR-0034 escrito e indexado                                     | cumplido                     |                                                                                                                                                                                                             |

**Tamaños medidos** (CI de #26, versión 0.3.1; MB de 1024×1024):

| Artefacto                | Tamaño            | RNF-05                |
| ------------------------ | ----------------- | --------------------- |
| `win-x64-setup.exe`      | 110,4MB           | ✅ (etapa 1: 110,3MB) |
| `win-x64-portable.exe`   | 100,3MB           | ✅                    |
| `win-arm64-setup.exe`    | 105,8MB           | ✅                    |
| `mac-arm64.dmg` / `.zip` | 121,2MB / 117,2MB | medido, sin techo     |
| `mac-x64.dmg` / `.zip`   | 125,2MB / 121,2MB | medido, sin techo     |
| `linux-x86_64.AppImage`  | 127,5MB           | medido, sin techo     |
| `linux-amd64.deb`        | 100,5MB           | medido, sin techo     |

**El margen de RNF-05 en Windows es de 9,6MB, no de 22MB** como decía el plan: el `.exe` de la etapa 1 ya medía 110,3MB. Esta etapa le sumó 0,1MB.

**Lo que salió distinto de lo previsto:**

- **T2, rasterizar el ícono.** El contenedor no tiene navegadores de Playwright descargados. El PNG se genera con el Chromium de Electron en modo offscreen (`apps/desktop/scripts/render-icon.mjs`, `pnpm --filter @pastecode/desktop icon`); como root hace falta `--no-sandbox` en la línea de comandos. Con un `await app.whenReady()` de nivel superior en un main ESM, Electron no emite nunca `ready`: va con `.then`. electron-builder sí deriva `.ico` e `.icns` de un PNG (`iconConverter` de app-builder-lib), así que no se versionan.
- **T3, macOS sin firma no arranca.** El schema dice que sin identidad electron-builder **no firma nada** (no hay ad-hoc automático), y Apple Silicon no ejecuta código nativo sin al menos firma ad-hoc. Se usa `mac.identity: '-'` y `hardenedRuntime: false` (con ad-hoc, el hardened runtime rechaza los frameworks de Electron, según el mismo schema). No es una firma con certificado: Gatekeeper avisa igual.
- **T3, el `.deb` exige `homepage`.** Falló con _Please specify project homepage_. `apps/desktop/package.json` suma `homepage` y `repository`.
- **T3, `${arch}`.** Cada destino lo traduce: `x86_64` en el AppImage y `amd64` en el `.deb`, no `x64`. Se dejó así: es lo que espera quien los baja.
- **T4, `process.platform` en el preload sandboxeado** existe (verificado por el smoke, que ahora compara `window.pastecode.platform` con el sistema).
- **T4, `toKeyCombination` y `shortcutLabel` reciben la plataforma** como parámetro en vez de leer `window.pastecode`: así son puras y se testean por tabla. En macOS, `Control` también cuenta como `ctrl`.
- **T4, el sandbox de Chromium en Ubuntu 24.04.** El job de smoke habilita `kernel.apparmor_restrict_unprivileged_userns=0` antes de lanzar, en vez de `--no-sandbox`. Pasó a la primera.
- **T5, etiquetas de runner.** `docs.github.com` no se puede leer desde la sesión; se verificaron en el README de `actions/runner-images`. macOS Intel: **`macos-26-intel`** (existe también `macos-15-intel`; `macos-13` no aparece y `macos-14` se retiró el 2 de noviembre de 2026). Tomó el job en su primera corrida.
- **T5, `resources/elevate.exe`.** Las dos filas de Windows fallaron en `verify-package` porque ese archivo es x86: es el ayudante de elevación que el NSIS de electron-builder copia siempre. Se acepta por ruta exacta y sólo como ia32.
- **T5, node-pty en Windows** se llama `conpty.node`, no `pty.node` (verificado en el tarball de `@lydell/node-pty-win32-x64`).
- **T6, dos `latest-mac.yml`.** El plan sólo hablaba de los dos `latest.yml` de Windows. Los dos jobs de macOS también escriben uno cada uno; `scripts/merge-update-info.mjs` los une sumando la lista `files`, que es de donde electron-updater elige el de su arquitectura.
- **T6, versiones de acciones.** `actions/attest-build-provenance@v4` (la última mayor, v4.2.2, verificada con `git ls-remote`).
- **T7, versión de `electron-updater`.** `latest` es 6.8.11, que trae `builder-util-runtime` 9.7.0; se fijó **6.8.12** (dist-tag `v26`, publicada el 2026-10-26), que comparte la 9.7.1 con el `electron-builder` 26.18.1 instalado.
- **T7, el `import()` diferido va desde el principio**, no como plan B: electron-updater queda en un chunk aparte de ~574 KB (`out/main/chunks/main-*.js`) que el main recién lee en el primer chequeo; `out/main/index.js` pasó de 357 a 366 KB. Se comprobó cargando el chunk dentro de Electron: entrega un `AppImageUpdater` con `autoDownload: true` por omisión, que el adaptador apaga.
- **T7, `update:openReleasePage`.** Canal nuevo, además de los cuatro del plan: el comando `app.openReleasePage` necesitaba un camino al main y no había ningún canal que abra URLs. No recibe la URL: abre la del estado del main, que además pasa por `isSafeExternalUrl`.
- **T7, `update:install` y el apagado.** El apagado de `before-quit` se movió a `services/quit.ts` (`shutdownOnce`, idempotente). Instalar lo corre **antes** de llamar a `quitAndInstall`, porque `quitAndInstall` lanza el instalador de NSIS en el acto y éste cierra lo que encuentre; después el `app.quit()` del actualizador pasa por `before-quit`, que encuentra la promesa resuelta y sale.
- **T7, `publish` explícito** en `electron-builder.yml` (proveedor GitHub): es lo que graba `resources/app-update.yml`. Verificado en el paquete de Linux.
- **T7, canal `beta`** se implementa con `allowPrerelease`, no con `channel`: el proveedor de GitHub con `allowPrerelease` toma el último prerelease, y `channel` pediría archivos `beta.yml` que electron-builder no genera por omisión.
- **T7, qué muestra la status bar.** `available`, `downloading` y `downloaded` siempre; `checking`, `up-to-date`, `error` y `unsupported` sólo si la persona pidió buscar en la sesión, para que un chequeo de arranque sin red no ensucie la barra.

**Lo que la etapa siguiente tiene que saber:**

- `PasteCodeApi` tiene `platform` (`'win32' | 'darwin' | 'linux'`), y `installFakeApi(responses, platform = 'win32')` lo acepta como segundo argumento. Un componente que lea `window.pastecode.platform` necesita la API falsa instalada en su test (le pasó a `MenuBar.test.tsx`).
- El apagado ordenado es `shutdownOnce()` en `main/services/quit.ts`. Si la etapa 3 agrega otra forma de cerrar la app, que pase por ahí.
- El grupo de settings `update` es entero sólo de usuario (`resolveSettings` no mira el workspace). La etapa 3 (confianza) puede querer citarlo.
- El spec del asar (`extension-host.spec.ts`) ahora encuentra el paquete sin fuses en los tres sistemas (`e2e/tests/support/desktop.ts`). En Linux: `npx electron-builder --linux --dir --config electron-builder.unfused.yml --publish never` desde `apps/desktop`, y el spec corre y pasa. **Borrá `release-unfused/` después**, o deja de saltearse.
- `pnpm package:unfused` ahora arma sólo el directorio (`--dir`): el paquete sin fuses no se distribuye y no necesita instalador.
- El E2E local, con `xvfb-run -a pnpm test:e2e`: 67 pasan y 1 se saltea (el del asar, sin paquete). Se sumó `update.spec.ts`.
- Flaky de `src/main/lsp/client.test.ts`: no apareció en esta etapa.
- **Flaky nuevo en macOS: `src/main/services/keybindings.test.ts`.** Dos corridas seguidas de `Tests (macos-latest)` fallaron por timeout en tests distintos del watcher (_"avisa de un conflicto que apareció al editar el archivo"_ y _"conserva los últimos atajos buenos cuando el archivo se rompe"_); la tercera pasó, y en `a941865` había pasado a la primera. Esta etapa no tocó ese servicio. Hay una inconsistencia en el test: `waitFor` espera hasta `TIMEOUT_MS = 10_000`, pero Vitest corta cada test a los 5 s, así que un evento de FSEvents que tarde más de 5 s falla como timeout y no con el mensaje de `waitFor`. No se persiguió.

**Pendiente del autor:**

- Cambiar el mantenedor del `.deb` si no quiere la dirección `matiaspasteloff@users.noreply.github.com` (`linux.maintainer` en `electron-builder.yml`).
- Empujar `v0.4.0-beta.1` (subiendo antes la versión y el `CHANGELOG.md`), revisar el borrador y publicarlo. Es la primera corrida de `release.yml`.
- Instalar en Windows (x64 y arm64), macOS y Linux de verdad: que el ícono se vea, que el instalador sea de un click, que macOS abra con click derecho → Abrir.
- Publicar `v0.4.0-beta.2` y comprobar la actualización de punta a punta en Windows x64 y en el AppImage, y el aviso en el resto. Para probar el canal beta hace falta `update.channel: "beta"` en el `settings.json` del usuario.
- Decidir el techo de RNF-05 para macOS y Linux con los números de un release real.
