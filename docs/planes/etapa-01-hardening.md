# Etapa 1 — Hardening de Electron

[← Planes de ejecución](./README.md) · [Informe](../informes/2026-11-auditoria.md) · [Siguiente: instalador →](./etapa-02-instalador.md)

**Rama:** `claude/ide-exponential-improvements-mh7gtv-e1` · **PR contra:** `claude/ide-exponential-improvements-mh7gtv`

## Objetivo

Cerrar los hallazgos S3 a S6 y S8 a S13 del informe: todo lo que es hardening sin decisión de producto. Al terminar, la app empaquetada niega los permisos de Chromium, no obedece `NODE_OPTIONS` ni `--inspect`, no tiene el menú por omisión de Electron, y la documentación de seguridad describe lo que el código hace.

**Fuera de esta etapa:** confianza de workspace y aislamiento de extensiones (S1 y S2, etapa 3); auto-update y firma (S7, etapa 2).

## Leer antes

- [`docs/convenciones/seguridad.md`](../convenciones/seguridad.md) — se reescribe en parte acá.
- `apps/desktop/src/main/index.ts`, `main/windows/create-window.ts`, `main/security/*.ts`, `main/environment.ts`.
- [ADR-0012](../adr/0012-servir-el-renderer-desde-un-protocolo-propio.md) y [ADR-0030](../adr/0030-barra-de-titulo-propia.md).

---

## Tareas

### T0 — Preflight del entorno

Antes de escribir código, llená la tabla **Entorno** de [`PROGRESO.md`](./PROGRESO.md): corré cada comando y anotá si funciona en tu contenedor, cuánto tarda y, si falla, el error exacto.

Para el E2E: Electron necesita un display. Probá `xvfb-run -a pnpm test:e2e` si `xvfb-run` existe. Si no hay forma de correrlo, anotalo y seguí: el E2E lo valida el job de Windows del PR.

Commit: `docs: registrar qué corre en el entorno de la nube`.

### T0b — Dejar `pnpm audit` en verde

**Va antes que todo lo demás: sin esto ningún PR de la pila puede tener el CI en verde.**

El job _Calidad_ corre `pnpm audit --audit-level=high` (RNF-15) y hoy falla sobre el mismo `pnpm-lock.yaml` que tiene `main`: 105 avisos, 44 altos y 1 crítico, publicados después del último merge. No los introdujo ningún cambio; son dependencias transitivas de desarrollo. El que más se repite es `undici` —[GHSA-qrxm-fqhp-jwvm](https://github.com/advisories/GHSA-qrxm-fqhp-jwvm)—, que entra por `electron` → `@electron/get`, por `electron-builder` → `node-gyp`, y por `vitest` → `jsdom`.

Cómo arreglarlo, en este orden de preferencia:

1. **Subir la dependencia directa** que arrastra la vulnerable, a una versión que ya traiga el parche (`electron` dentro de su major, `electron-builder`, `jsdom`, `vitest`). Respetá los dos pines de [ADR-0009](../adr/0009-pinear-typescript-y-vite.md): `typescript` 6.0.3 y `vite` 7.3.6 no se mueven.
2. **`overrides` de pnpm** para una transitiva cuando la directa todavía no publicó el arreglo. Cada override lleva un comentario con el aviso que cierra, para que se pueda sacar el día que deje de hacer falta.
3. Lo que no tenga parche publicado **no se silencia en bloque**. Si hay que ignorar un aviso puntual, va con su identificador, el motivo y por qué no es explotable acá —una dependencia de desarrollo que nunca llega al instalador no es lo mismo que una de runtime—.

Corré `pnpm audit --audit-level=high` hasta que salga limpio, y después `pnpm check` y `pnpm build`: subir Electron o Vitest puede romper algo que el audit no ve. `minimumReleaseAge` de pnpm retiene las versiones publicadas hace muy poco; si el parche es demasiado nuevo, usá `minimumReleaseAgeExclude` con la versión exacta, como ya hace `pnpm-workspace.yaml` con Turbo.

Subir una versión de algo que ya está no es "agregar una dependencia", así que la regla 4 no pide justificarlo una por una; sí pide decir en el PR qué se subió y por qué.

Commit: `fix(build): actualizar las dependencias con avisos de seguridad altos`.

### T1 — Scope `security`

Agregá `security` a la lista cerrada de `commitlint.config.js` y a `docs/convenciones/git.md`, con una frase que diga qué cubre: el hardening del main y la política de la app empaquetada. Los dos archivos se tocan juntos.

Commit: `chore(build): agregar el scope security`.

### T2 — CSP: `form-action` y `frame-ancestors`

En `main/security/content-security-policy.ts`, sumá a `PRODUCTION_DIRECTIVES`:

```ts
'form-action': ["'none'"],
'frame-ancestors': ["'none'"],
```

Ninguna de las dos hereda de `default-src`, por eso faltaban sin que nadie lo notara. `frame-ancestors` sólo funciona por header, que es como ya se emite.

- Actualizá `content-security-policy.test.ts`: las dos directivas presentes en producción y en desarrollo.
- Actualizá el bloque de CSP de `seguridad.md` y el texto de RNF-13 en `04-requerimientos-no-funcionales.md`.

### T3 — Permisos de Chromium denegados por omisión

Archivo nuevo: `main/security/permissions.ts`, con dos funciones.

**La decisión, pura y testeable:**

```ts
export function isPermissionAllowed(
  permission: string,
  requestingOrigin: string | undefined,
  appOrigin: string,
  devServerOrigin: string | undefined
): boolean;
```

- Devuelve `true` sólo si el permiso está en una allow-list **y** el origen es el de la app (o el del dev server en desarrollo).
- Allow-list inicial: `clipboard-read` y `clipboard-sanitized-write`. La acción _Pegar_ del menú contextual de Monaco usa `navigator.clipboard`. **Si el E2E pasa con la lista vacía, dejala vacía** y anotalo: es mejor.
- El origen se compara con el mismo criterio que `navigation.ts`. Ojo: `new URL('pastecode://app').origin` devuelve `'null'` en Node; por eso `navigation.ts` tiene su propio `originOf`. Exportalo o movelo a un módulo compartido; no lo dupliques.

**El cableado:**

```ts
export function applyPermissionPolicy(
  session: Session,
  devServerOrigin: string | undefined
): void;
```

Usa `session.setPermissionRequestHandler` y `session.setPermissionCheckHandler`. Verificá en `electron.d.ts` la firma exacta de cada callback y de dónde sale el origen que pide (`details.requestingUrl` en uno, el parámetro `requestingOrigin` en el otro). Si existe `session.setDevicePermissionHandler`, respondé `false` siempre.

Se llama desde `create-window.ts`, al lado de `applyContentSecurityPolicy`.

**Tests:**

- `permissions.test.ts`: tabla con permiso permitido + origen propio, permiso permitido + origen ajeno, permiso no listado + origen propio, origen `undefined`, y el dev server sólo cuando se pasa.
- `e2e/tests/security.spec.ts` (nuevo): desde el renderer, `navigator.permissions.query({ name: 'geolocation' })` da `denied`, y `navigator.mediaDevices.getUserMedia({ audio: true })` rechaza.

### T4 — Guarda global de `webContents`

Archivo nuevo: `main/security/web-contents-guard.ts`.

```ts
export function installWebContentsGuard(
  appOrigin: string,
  devServerOrigin: string | undefined
): void;
```

Engancha `app.on('web-contents-created', …)` y, para **todo** `webContents` que se cree:

- `will-attach-webview` → `event.preventDefault()`. La app no usa `<webview>`.
- `will-navigate` y `will-redirect` → se cancelan si `isAllowedNavigation` dice que no.
- `setWindowOpenHandler` → `isSafeExternalUrl` decide si va a `shell.openExternal`; siempre `{ action: 'deny' }`.

`isAllowedNavigation` e `isSafeExternalUrl` ya existen en `navigation.ts`: se reusan. **Sacá la copia de `create-window.ts`** — que la regla exista en un solo lugar es el punto.

Para poder testear sin Electron, separá la parte que recibe un `webContents` detrás de una interfaz mínima, como hace `MaximizableWindow` en `main/ipc/window.ts`.

Se llama una vez desde `main/index.ts`, antes de `app.whenReady()`.

**Tests:**

- Unitario con un `webContents` falso: cada evento se cancela o no según la URL.
- En `security.spec.ts`: `window.open('file:///c:/windows/win.ini')` no crea una ventana (contá `BrowserWindow.getAllWindows()` desde el main), y asignar `location.href = 'https://example.com'` deja la URL en el origen de la app. **No uses una URL `https:` con `window.open` en el test**: abriría el navegador del runner.

### T5 — Sacar el menú por omisión

Archivo nuevo: `main/windows/application-menu.ts`.

| Caso                      | Qué se instala                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| Desarrollo                | Nada: se deja el de Electron, que es el que da DevTools y recarga                                       |
| Producción, macOS         | Un menú mínimo por roles: `appMenu`, `editMenu`, `windowMenu`. Sin `editMenu`, en macOS no anda `Cmd+C` |
| Producción, Windows/Linux | `Menu.setApplicationMenu(null)`                                                                         |

Poné la decisión en una función pura que reciba la plataforma y `isDevelopment`, y testeala. Se aplica dentro de `whenReady`, antes de `createMainWindow()`.

**Qué mirar en el E2E:** el E2E corre sobre el build de producción, así que pierde el menú. Si algún spec dependía de un acelerador del menú por omisión —recargar, zoom, `Ctrl+W` sin pestañas—, va a fallar acá. Es información, no un obstáculo: arreglá el spec o el atajo, y anotá cuál era en `PROGRESO.md`. Eso además confirma o descarta el _a confirmar_ del hallazgo S5.

### T6 — Cablear `window.zoomLevel`

T5 saca el zoom nativo, y `window.zoomLevel` es una de las cinco settings que el schema acepta y nadie lee. Se resuelven juntas.

- **`packages/core`**: `nextZoomLevel(current, direction)` con `direction: 'in' | 'out' | 'reset'`. Paso de 0,5, acotado al rango del schema (−5 a 5). Con test.
- **main**: aplicar `webContents.setZoomLevel(settings.window.zoomLevel)` al crear la ventana y cada vez que cambian las settings. El punto donde ya se enteran todas las ventanas es `broadcast` en `main/ipc/settings.ts`.
- **renderer**: comandos `view.zoomIn`, `view.zoomOut`, `view.zoomReset`, que mandan `settings:update` con `scope: 'user'`. Siguen el molde de `features/workspace/view-commands.ts`. Títulos en `i18n/es.ts`.
- **Atajos** en `default-keybindings.ts`: `ctrl+=`, `ctrl+-`, `ctrl+0`. Verificá en `key-combination.ts` cómo se normalizan `=` y `-` antes de escribirlos.
- Sumalos al menú _Ver_ de `components/menu-registry.ts`.

**Tests:** el de `core`; uno de `use-app-commands` o equivalente que verifique el `settings:update` emitido; y un E2E corto que ejecute el comando desde la paleta y lea `webContents.getZoomLevel()`.

### T7 — Instancia única

En `main/index.ts`: `app.requestSingleInstanceLock()`. Si no se obtiene, `app.quit()` y no se registra nada más. Si se obtiene, `second-instance` restaura y enfoca la ventana existente.

- El bloqueo **no se aplica cuando hay `dataDirectoryOverride`** (la variable del E2E). La decisión va en una función pura con su test.
- `index.ts` ya tiene 117 líneas de cableado. Si el `if` del bloqueo obliga a anidar todo, extraé el arranque a una función; el límite de 50 líneas por función es un error de lint.

### T8 — Fuses

En `apps/desktop/electron-builder.yml`:

```yaml
electronFuses:
  runAsNode: true
  enableCookieEncryption: true
  enableNodeOptionsEnvironmentVariable: false
  enableNodeCliInspectArguments: false
  enableEmbeddedAsarIntegrityValidation: true
  onlyLoadAppFromAsar: true
  grantFileProtocolExtraPrivileges: false
```

**Verificá primero** que `electronFuses` y cada una de esas claves existan en `node_modules/app-builder-lib/scheme.json`. Si la clave no existe en la versión instalada, la alternativa es un hook `afterPack` con `@electron/fuses` (dependencia de desarrollo nueva: justificala en el PR).

Tres cosas que hay que dejar escritas como comentario en el YAML, en el estilo del archivo:

1. **`runAsNode` queda encendido, y es una excepción.** El servidor de TypeScript empaquetado se lanza con el binario de Electron y `ELECTRON_RUN_AS_NODE=1`, hablando LSP por stdio. `utilityProcess` no da stdin, así que no lo reemplaza.
2. **`grantFileProtocolExtraPrivileges: false` es gratis** porque el renderer ya se sirve por `pastecode://` (ADR-0012). El `net.fetch` de `app-protocol.ts` corre en el main y no lo afecta.
3. **Con `--inspect` apagado, Playwright no puede adjuntarse al binario empaquetado.** El test de `e2e/tests/extension-host.spec.ts` que lanza `release/win-unpacked/PasteCode.exe` deja de poder correr contra un paquete con fuses. Agregá un script `package:unfused` que empaquete a `release-unfused/` con ese fuse encendido, apuntá el spec ahí, y actualizá su mensaje de `skip`.

**Verificación:** si tu entorno puede, `electron-builder --linux --dir` y leer los fuses del binario resultante. Si no puede, queda para el CI y se anota.

### T9 — Higiene de la cadena de suministro

- **`.github/dependabot.yml`**: ecosistemas `npm` y `github-actions`, semanal, con agrupación de minor y patch. Ignorá los majors que [ADR-0009](../adr/0009-pinear-typescript-y-vite.md) tiene fijados: `typescript` ≥ 6.1 y `vite` ≥ 8.
- **`SECURITY.md`** en la raíz: cómo reportar una vulnerabilidad en privado, qué versiones reciben arreglos, y un link al modelo de amenazas.
- **`.github/workflows/ci.yml`**: `permissions: contents: read` a nivel superior. El job `perf-budget` ya declara los suyos y los conserva.
- **`main/ai/credentials.ts`**: en Linux, si `safeStorage.getSelectedStorageBackend()` devuelve `basic_text`, `canPersistApiKey()` responde `false`. Verificá el método en `electron.d.ts` —existe sólo en Linux— y cubrilo en `credentials.test.ts` siguiendo cómo ese archivo ya mockea `electron`.

### T10 — Documentación

- **`docs/convenciones/seguridad.md`**:
  - El bloque de "Configuración obligatoria" deja de mostrar `url.startsWith('file://')`; describe la guarda global.
  - La sección de CSP dice que se emite por header y no por `<meta>`.
  - Secciones nuevas: permisos, fuses (con la excepción de `runAsNode`), menú de aplicación, instancia única.
  - **La tabla del modelo de amenazas de extensiones se corrige para decir la verdad**: hoy el host corre con Node completo y las capabilities limitan la API, no el proceso. Enlazá al [plan de la etapa 3](./etapa-03-confianza.md), que es donde se resuelve.
- **`docs/extension-api/README.md`**: la línea que dice _"No hay acceso al filesystem. Ni a `node:fs` de forma útil"_ se reescribe. Lo cierto es que la API no ofrece filesystem, y que el proceso todavía no está confinado.
- **`docs/04-requerimientos-no-funcionales.md`**: RNF-13 con las directivas nuevas. Requerimientos nuevos con IDs nuevos —los IDs no se reciclan— para permisos denegados por omisión y para los fuses.
- **`docs/adr/0033-hardening-de-la-app-empaquetada.md`**, con [la plantilla](../adr/TEMPLATE.md): permisos, fuses y menú, con la excepción de `runAsNode` y sus alternativas descartadas. Agregalo al índice de `docs/adr/README.md`.
- **`docs/06-roadmap-y-riesgos.md`**: un riesgo nuevo en la tabla, "el extension host corre con Node completo".
- **`docs/planes/PROGRESO.md`**: tu sección.

---

## Criterios de aceptación

1. `pnpm check`, `pnpm format:check`, `pnpm knip` y `pnpm coverage` pasan.
2. El CI del PR está en verde, incluidos E2E y presupuestos de performance.
3. La CSP de producción incluye `form-action 'none'` y `frame-ancestors 'none'`.
4. `security.spec.ts` demuestra: permiso denegado, `window.open` externo sin ventana nueva, navegación externa bloqueada.
5. Ni `create-window.ts` ni ningún otro archivo repite la lógica de navegación de la guarda.
6. Los comandos de zoom funcionan y persisten en `settings.json`.
7. `electron-builder.yml` declara los fuses, con `runAsNode` documentado como excepción.
8. `seguridad.md` no contiene ninguna afirmación que el código contradiga.
9. ADR-0033 escrito e indexado.

## Trampas

- **RNF-01 mide el arranque.** Nada de lo de esta etapa puede hacer I/O síncrono antes de crear la ventana. Sacar el menú por omisión, de hecho, ahorra tiempo.
- **`onHeadersReceived` admite un solo listener por sesión.** No registres otro para nada de esto.
- **El E2E corre con `workers: 1` y de a una app por vez**, pero no lo des por hecho para el bloqueo de instancia única: por eso se desactiva bajo la variable del E2E.
- **No toques `webPreferences`.** Nada de esta etapa lo necesita.
