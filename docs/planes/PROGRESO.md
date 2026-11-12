# Progreso de los planes

[← Planes de ejecución](./README.md)

> Lo actualiza la sesión que ejecuta cada etapa. Es lo primero que lee la siguiente.

## Estado

| #   | Etapa                                      | Estado                       | PR  |
| --- | ------------------------------------------ | ---------------------------- | --- |
| 0   | Informe y planes                           | hecha                        | —   |
| 1   | Hardening de Electron                      | hecha con criterios abiertos | —   |
| 2   | Instalador y releases multiplataforma      | pendiente                    | —   |
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

| Comando                          | ¿Corre en la nube? | Notas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile` | sí                 | 4–15 s con el store caliente. Con Node 22 avisa `Unsupported engine` y sigue. **Con la caché de Electron fría, la descarga del binario falla a veces** con `AssertionError [ERR_ASSERTION]: assert(!this.paused)` en el `postinstall` de `apps/desktop`; volver a correr `pnpm install` lo resuelve                                                                                                                                                                                                                                                                                                                                              |
| `pnpm check`                     | sí, con más heap   | ~1 min 45 s. Sin `NODE_OPTIONS=--max-old-space-size=8192`, `eslint .` muere a los ~60 s con `FATAL ERROR: Ineffective mark-compacts near heap limit` (exit 134)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `pnpm format:check`              | sí                 | ~8 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `pnpm knip`                      | sí                 | ~3 s. Deja un _configuration hint_ (`src/renderer/main.tsx` es una entrada redundante en `knip.jsonc`) que no falla                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `pnpm coverage`                  | sí                 | ~40 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `pnpm build`                     | sí                 | ~10 s sin caché de Turbo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `pnpm test:e2e`                  | sí, con `xvfb-run` | `xvfb-run -a pnpm test:e2e`, ~90 s. Línea base: 63 pasan y 1 se saltea (el del asar, que pide un build empaquetado); al cerrar la etapa 1, 66 y 1. El spec del asar busca `release-unfused/win-unpacked/PasteCode.exe`: en Linux no existe y se saltea solo. Para correrlo acá hay que apuntarlo a mano al paquete de Linux (ver las notas de la etapa 1)                                                                                                                                                                                                                                                                                        |
| `pnpm package`                   | no (sólo a medias) | Por Turbo falla con `self-signed certificate in certificate chain`: Turbo filtra las variables de entorno y `NODE_EXTRA_CA_CERTS`, que apunta al CA del proxy de la nube, no llega a electron-builder. Corriendo el script del paquete sin Turbo (`pnpm --filter @pastecode/desktop package`) llega a armar `release/win-unpacked/` y falla en el NSIS con `spawn wine ENOENT`: no hay Wine. **Lo que sí anda**, desde `apps/desktop` y sin Turbo: `npx electron-builder --linux --dir --config electron-builder.yml` (~1 min), que arma `release/linux-unpacked/` con los fuses grabados. Borrá `release/` y `release-unfused/` cuando termines |

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
