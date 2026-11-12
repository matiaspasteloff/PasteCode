# Convenciones · Seguridad

[← Testing](./testing.md) · [Índice](../README.md) · [Build y release →](./build-y-release.md)

> Electron no es seguro por defecto. Al elegirlo ([ADR-0001](../adr/0001-electron-typescript.md)) aceptamos que el hardening es responsabilidad nuestra.

---

## Configuración obligatoria de Electron

```typescript
// apps/desktop/src/main/windows/create-window.ts
const window = new BrowserWindow({
  webPreferences: {
    nodeIntegration: false, // NUNCA true
    contextIsolation: true, // NUNCA false
    sandbox: true, // NUNCA false
    webSecurity: true, // NUNCA false
    allowRunningInsecureContent: false,
    preload: join(__dirname, '../preload/index.js'),
  },
});

applyContentSecurityPolicy(window.webContents.session, devServerOrigin);
applyPermissionPolicy(window.webContents.session, APP_ORIGIN, devServerOrigin);
```

Satisface [RNF-12](../04-requerimientos-no-funcionales.md#seguridad). **Sin excepciones, en ninguna ventana, ni siquiera para debugging.**

### Guarda global de navegación y de ventanas

La navegación **no** se controla ventana por ventana. `installWebContentsGuard` (`apps/desktop/src/main/security/web-contents-guard.ts`) se engancha a `app.on('web-contents-created')` antes de `app.whenReady()`, así que **todo** `webContents` que se cree —la ventana principal, una futura, un `<webview>`, una página de DevTools— nace con las mismas reglas:

```typescript
// apps/desktop/src/main/security/web-contents-guard.ts
contents.on('will-attach-webview', (event) => {
  event.preventDefault(); // la app no usa <webview>
});
contents.on('will-navigate', blockForeignNavigation); // sólo el origen de la app
contents.on('will-redirect', blockForeignNavigation); // un 302 es la misma navegación
contents.setWindowOpenHandler(({ url }) => {
  if (isSafeExternalUrl(url)) openExternal(url); // sólo https:, al navegador del sistema
  return { action: 'deny' }; // nunca una ventana nueva
});
```

"El origen de la app" es `pastecode://app` en producción, más el del dev server en desarrollo. La regla vive en un solo lugar, `security/url-origin.ts` (`isAppOrigin`), que usan la navegación y los permisos. **`file://` no está permitido**: desde [ADR-0012](../adr/0012-servir-el-renderer-desde-un-protocolo-propio.md) el renderer no se sirve de ahí, y una navegación a `file://` es exactamente la forma de abrir un HTML del disco con el preload inyectado. Se verifica en `e2e/tests/security.spec.ts`.

---

## Content Security Policy

La CSP se emite **por header, desde el main**, y no con un `<meta>` en el HTML: un `<meta>` vive en el renderer, que es justamente la capa de la que la CSP tiene que defendernos. La política de producción, tal como la arma `apps/desktop/src/main/security/content-security-policy.ts`:

```text
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
connect-src 'self';
font-src 'self';
object-src 'none';
base-uri 'none';
form-action 'none';
frame-ancestors 'none'
```

`form-action` y `frame-ancestors` **no heredan de `default-src`**: sin declararlas quedaban abiertas aunque el resto dijera `'self'`. `frame-ancestors`, además, sólo tiene efecto por header; un `<meta>` la ignora.

En desarrollo se relajan `script-src` (`'unsafe-inline' 'unsafe-eval'`, para React Refresh y el HMR) y `connect-src` (el origen del dev server y su WebSocket). Nada más: el E2E corre sobre el build de producción, que es el que se distribuye.

`unsafe-inline` en `style-src` es una concesión a Monaco, que inyecta estilos dinámicamente. Se documenta como **excepción conocida** y se revisa en cada actualización de Monaco. Ver [ADR-0002](../adr/0002-monaco-editor.md).

---

## Permisos de Chromium

Sin handlers, Electron **concede** cámara, micrófono, geolocalización, notificaciones y el resto de los permisos de Chromium a cualquier página que los pida. `applyPermissionPolicy` (`apps/desktop/src/main/security/permissions.ts`) instala los tres handlers de la sesión:

| Handler                       | Qué responde                                                |
| ----------------------------- | ----------------------------------------------------------- |
| `setPermissionRequestHandler` | `isPermissionAllowed(permiso, details.requestingUrl, …)`    |
| `setPermissionCheckHandler`   | `isPermissionAllowed(permiso, requestingOrigin, …)`         |
| `setDevicePermissionHandler`  | `false`, siempre: HID, USB y serial no tienen uso en un IDE |

Hacen falta los dos primeros: Chromium **chequea** antes de **pedir**, y con uno solo la otra mitad sigue concediendo. `isPermissionAllowed` exige las dos condiciones: el permiso en la allow-list **y** el origen de la app.

La allow-list es `clipboard-read` y `clipboard-sanitized-write`, porque el _Pegar_ del menú contextual de Monaco lee con `navigator.clipboard.readText()`. Satisface [RNF-30](../04-requerimientos-no-funcionales.md#seguridad); ver [ADR-0033](../adr/0033-hardening-de-la-app-empaquetada.md).

---

## Menú de aplicación

El menú por omisión de Electron trae recargar, forzar recarga y DevTools con sus aceleradores. `applyApplicationMenu` (`apps/desktop/src/main/windows/application-menu.ts`) lo reemplaza dentro de `whenReady`, antes de crear la ventana:

| Caso                      | Menú                                                       |
| ------------------------- | ---------------------------------------------------------- |
| Desarrollo                | El de Electron, sin tocar: es el que da DevTools y recarga |
| Producción, macOS         | Mínimo, por roles: `appMenu`, `editMenu`, `windowMenu`     |
| Producción, Windows/Linux | Ninguno (`Menu.setApplicationMenu(null)`)                  |

En macOS el `editMenu` no es opcional: sin él no anda `Cmd+C`. El zoom que se fue con el menú volvió como comandos (`view.zoomIn`, `view.zoomOut`, `view.zoomReset`) que escriben `window.zoomLevel` en las settings.

---

## Instancia única

Dos instancias a la vez compiten por la sesión, las settings, los backups y la clave del asistente. `claimSingleInstance` (`apps/desktop/src/main/windows/single-instance.ts`) pide `app.requestSingleInstanceLock()` antes de registrar nada: si no lo obtiene, la app sale; si lo obtiene, `second-instance` restaura y enfoca la ventana que ya estaba.

Bajo `PASTECODE_E2E_HOME` el bloqueo no se pide —cada test tiene su propio directorio de datos—, y esa variable ya se ignora en la app empaquetada (`environment.ts`), así que no es una forma de desactivarlo en el instalador.

---

## Fuses de Electron

Los fuses se graban en el binario al empaquetar (`electronFuses` en `apps/desktop/electron-builder.yml`) y no se pueden cambiar en runtime: son la política de la app instalada, no de quien la lanza. Satisfacen [RNF-31](../04-requerimientos-no-funcionales.md#seguridad).

| Fuse                                    | Valor     | Por qué                                                                                           |
| --------------------------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| `runAsNode`                             | encendido | **Excepción.** El servidor de TypeScript empaquetado corre con `ELECTRON_RUN_AS_NODE=1` por stdio |
| `enableCookieEncryption`                | encendido | Las cookies en disco, cifradas con el almacén del sistema                                         |
| `enableNodeOptionsEnvironmentVariable`  | apagado   | `NODE_OPTIONS` deja de inyectar código en el main. Apaga también `NODE_EXTRA_CA_CERTS`            |
| `enableNodeCliInspectArguments`         | apagado   | `--inspect` deja de abrir un depurador sobre el main                                              |
| `enableEmbeddedAsarIntegrityValidation` | encendido | El asar se valida contra el hash embebido (Windows y macOS)                                       |
| `onlyLoadAppFromAsar`                   | encendido | La app no se carga desde una carpeta `app/` que alguien deje al lado del asar                     |
| `grantFileProtocolExtraPrivileges`      | apagado   | Gratis: desde ADR-0012 ninguna página de la app vive en `file://`                                 |

**La excepción de `runAsNode`.** `utilityProcess` no da stdin, y el LSP habla por stdio, así que no lo reemplaza. El costo es que quien pueda lanzar el `.exe` con esa variable tiene un Node: lo mismo que ya tiene con el Node del sistema. Las alternativas descartadas están en [ADR-0033](../adr/0033-hardening-de-la-app-empaquetada.md).

Con `--inspect` apagado, Playwright no puede adjuntarse al paquete distribuido. El E2E del asar corre contra `pnpm --filter @pastecode/desktop package:unfused`, que empaqueta a `release-unfused/` con ese único fuse encendido y **no se distribuye**.

---

## Validación de rutas

Toda ruta que cruce el límite de IPC pasa por acá. Sin excepciones. Satisface [RNF-11](../04-requerimientos-no-funcionales.md#seguridad).

```typescript
import { resolve, relative, isAbsolute } from 'node:path';
import { realpath } from 'node:fs/promises';

/**
 * Valida que una ruta esté contenida dentro del workspace, resolviendo
 * symlinks para evitar escapes.
 *
 * @throws {PathOutsideWorkspaceError} si la ruta escapa del workspace
 * @example
 * await assertInsideWorkspace('/proyecto/src/a.ts', '/proyecto'); // ok
 * await assertInsideWorkspace('/etc/passwd', '/proyecto');        // throws
 */
export async function assertInsideWorkspace(
  candidate: string,
  workspaceRoot: string
): Promise<string> {
  const realRoot = await realpath(workspaceRoot);
  const resolved = resolve(realRoot, candidate);
  const real = await realpath(resolved).catch(() => resolved);

  const rel = relative(realRoot, real);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new PathOutsideWorkspaceError(candidate);
  }
  return real;
}
```

> **Por qué `realpath`:** sin resolver symlinks, un atacante puede crear `workspace/link → /etc` y escapar pasando una ruta que _parece_ estar adentro.

El bloque de arriba es la idea, no el código. La implementación real es `resolveInsideWorkspace` en `apps/desktop/src/main/services/path-guard.ts`: resuelve el `realpath` del ancestro más profundo que exista —para poder validar también una ruta que todavía no existe, como un archivo nuevo— y compara con `isInsideRoot` de `packages/core`, que cubre mayúsculas, otra unidad y rutas UNC.

---

## Validación de input en IPC

**El renderer no es de confianza.** Aunque hoy sólo corra nuestro código, mañana una extensión comprometida o un XSS pueden estar del otro lado.

```typescript
// Todo handler valida antes de tocar nada
const ReadFileRequest = z.object({
  path: z.string().min(1),
  encoding: z.enum(['utf8', 'binary']).optional(),
});

ipcMain.handle('fs:readFile', async (_event, raw: unknown) => {
  const payload = ReadFileRequest.parse(raw);
  const safePath = await assertInsideWorkspace(payload.path, currentWorkspace);
  // ...
});
```

En el código nadie llama a `ipcMain.handle` directo: todo handler se registra con `registerHandler` (`apps/desktop/src/main/ipc/handler.ts`), que recibe el schema del contrato de `packages/ipc-contract` y valida antes de llamar. El ejemplo de arriba es lo que hace por dentro.

---

## Procesos hijo y binarios externos

PasteCode lanza procesos que no escribió: el shell de la terminal, `ripgrep`, los servidores de LSP, el extension host y el adaptador de DAP. Cada uno es una decisión de "ejecutar esto" y ninguna es inocente, porque **el nombre del ejecutable puede venir de un archivo del proyecto** y un `.pastecode/settings.json` viaja adentro de cualquier repositorio que se clone.

### El ejecutable nunca se resuelve por `PATH`

```typescript
// apps/desktop/src/main/services/shell.ts
const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';

return {
  file: join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
  args: ['-NoLogo'],
};
```

Lanzar `powershell` a secas deja que gane cualquier `powershell.exe` que aparezca antes en el `PATH`, y el `PATH` de una sesión de desarrollo lo escriben herramientas, no personas. Lo mismo para `ripgrep`: se resuelve desde `process.resourcesPath` cuando la app está empaquetada y desde `node_modules` en desarrollo, **nunca** buscándolo en el sistema.

### La enmienda de `git`: candidatos absolutos primero, `PATH` sólo para construirlos

`git` es la excepción que obliga a escribir la regla con más precisión, y no a romperla. No se puede empaquetar —son decenas de megabytes contra el techo de [RNF-05](../04-requerimientos-no-funcionales.md#recursos), y aunque cupiera sería un `git` sin el `credential.helper` ni la configuración de la persona—, así que hay que usar el que está instalado en el sistema.

La regla completa, entonces:

1. **`git.path` de las settings**, si está. Como `terminal.shell`: ruta absoluta a un ejecutable que exista, y **el workspace no puede escribirla**.
2. **Los directorios de instalación conocidos** de la plataforma: `%ProgramFiles%\Git\cmd` y sus variantes en Windows; `/usr/bin`, `/usr/local/bin`, `/opt/homebrew/bin` en POSIX. Son rutas que no escribe nadie.
3. **El `PATH`, y sólo como fuente de directorios.** Con cada uno se **construye** una ruta absoluta que después pasa por `assertExecutable`. Nunca se lanza `git` por nombre dejando que el sistema operativo elija en el momento de la llamada, que es lo que la regla de arriba prohíbe y lo que después no se puede auditar.

### `debug.adapterPath`: elegir el adaptador es elegir qué se ejecuta al apretar F5

El adaptador de debug es un ejecutable de terceros y **no viene empaquetado**, por las mismas razones que `git` y los servidores de lenguaje ([ADR-0028](../adr/0028-adaptador-dap-externo-y-cliente-propio.md)). La ruta sale de `debug.adapterPath`, que está en la **misma allow-list del usuario** que `terminal.shell`, `lsp.serverPaths` y `git.path`: el workspace no la puede escribir.

`debug.adapterArgs` está en la misma lista, y no es exceso de celo. Sin eso el repositorio no elegiría el ejecutable pero sí con qué flags corre, y un `--eval` sobre un adaptador legítimo alcanza para ejecutar código. Lo que el workspace **sí** puede tocar es `debug.requestTimeoutMs`, que no elige nada: un proyecto con un adaptador lento tiene un motivo legítimo para pedir más tiempo. La distinción está fijada con tests en `packages/core/src/settings/merge.test.ts`.

El `launch.json` del workspace, en cambio, sí lo escribe el repositorio, y eso es seguro por la misma distinción: dice **qué** depurar, no **con qué**.

Además: se **rechaza cualquier candidato adentro de la raíz del workspace** —un repositorio clonado puede traer su propio `git.exe`—, lo que llega a `spawn` es siempre absoluto y siempre verificado, y **se resuelve una sola vez al arrancar y nunca se re-resuelve**. Ver [ADR-0019](../adr/0019-git-con-spawn-crudo.md).

### `lsp.serverPaths` va contra la misma allow-list

Cada entrada del mapa es una ruta absoluta a un ejecutable que existe, verificada con `assertExecutable` antes de lanzarlo. **El workspace no puede escribir el mapa** —ni una sola clave—, y con el LSP la apuesta es más alta que con la terminal: elegir el ejecutable de un servidor de lenguaje es elegir **qué se ejecuta al abrir un `.py`**, sin que nadie haya hecho click en nada.

Los servidores que sí empaquetamos se lanzan con el binario de Electron en modo Node (`ELECTRON_RUN_AS_NODE=1`), con la ruta del módulo resuelta desde el `node_modules` de la aplicación. Notar la inversión: `sanitizedEnvironment` **quita** esa variable del entorno de los procesos hijo, y el lanzador del LSP la repone para el suyo. Sanear protege el shell de la persona; ponerla para nuestro propio hijo es el uso previsto.

### `terminal.shell` va contra una allow-list

La regla es:

- El valor por defecto (`null`) es el shell del sistema operativo, resuelto como arriba.
- Un valor distinto tiene que ser una **ruta absoluta a un archivo que exista** (`resolveShell` en `services/shell.ts`). **No hay una confirmación la primera vez**, como decía una versión anterior de este documento: la defensa es la de la regla siguiente, que el valor sólo lo puede escribir el usuario.
- **Un `.pastecode/settings.json` de workspace no puede elegir el ejecutable.** Fue la primera clave del schema con esa restricción —hoy la comparten `lsp.serverPaths`, `git.path`, `debug.adapterPath` y `debug.adapterArgs`, ver `packages/core/src/settings/merge.ts`—, y existe porque clonar un repositorio no puede ser lo mismo que aceptar ejecutar lo que el repositorio diga. La precedencia normal —workspace le gana a usuario— se invierte para esta clave.

### Argumentos como array, nunca como línea de comando

```typescript
spawn(shell.file, [...shell.args], { cwd, env }); // ✅
spawn(`${shell.file} ${args.join(' ')}`); // ❌
```

Un array llega al SO como `argv` y no pasa por ningún intérprete, así que un argumento con espacios, comillas o `&&` es un argumento y no un comando nuevo. Para lo que se lanza con `child_process` —ripgrep— eso además significa **`shell: false` explícito**. `node-pty` no tiene esa opción porque nunca usa un shell intermedio: ejecuta el archivo directamente.

### cwd acotado y entorno saneado

El `cwd` de todo proceso hijo es la raíz del workspace abierto. Sin workspace no se lanza nada: sin raíz no hay contra qué validar, igual que con las rutas.

Del entorno se sacan las variables que inyecta Electron y que afuera no significan nada o significan algo malo — `ELECTRON_RUN_AS_NODE` hace que cualquier Electron lanzado desde esa terminal arranque como Node en vez de como app. Heredar `process.env` entero es cómodo y es exactamente cómo se filtran estas cosas.

### Al cerrar, todos mueren

[RNF-10](../04-requerimientos-no-funcionales.md#confiabilidad) pide cero procesos huérfanos: `SIGTERM` a todos y `SIGKILL` a los 3 segundos. Esa redacción describe la mitad POSIX del problema. **En Windows no hay señales**: `kill(signal)` de node-pty lanza si se le pasa una, y `kill()` sin argumentos termina la consola entera de conpty, que es el equivalente. La escalación de dos fases existe igual en las dos plataformas —pedir, esperar, matar—; lo que cambia es con qué se pide.

Se verifica con un test automatizado que busca el pid en la tabla de procesos después de cerrar la app, no mirando la UI (`e2e/tests/terminal.spec.ts`).

---

## Excepciones conocidas de la CSP

| Directiva                   | Quién la necesita | Por qué                                                                                                                                                        |
| --------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `style-src 'unsafe-inline'` | Monaco            | Inyecta reglas de estilo dinámicamente para el resaltado. Ver [ADR-0002](../adr/0002-monaco-editor.md)                                                         |
| `style-src 'unsafe-inline'` | xterm             | Igual que Monaco: calcula el alto de fila y el ancho de celda en runtime y los escribe como estilo inline. No agrega una excepción nueva, se apoya en la misma |

[RNF-13](../04-requerimientos-no-funcionales.md#seguridad) documenta esa excepción sólo para Monaco. La entrada de xterm no relaja nada más: si algún día se saca Monaco, la directiva sigue haciendo falta.

---

## Modelo de amenazas — extensiones

Las extensiones son código de terceros. **Hoy el extension host es un `utilityProcess` con Node completo**: `node:fs`, `node:child_process` y `fetch` están disponibles para cualquier extensión, y las de `~/.pastecode/extensions/` se cargan solas al arrancar. Las capabilities limitan **la API de PasteCode**, no el proceso. Lo que el modelo cubre y lo que no:

| Amenaza                                         | Mitigación hoy                                                                                                                           | ¿Alcanza? |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Extensión que usa la API para algo no declarado | El main hace cumplir las capabilities: sin declaración, sin acceso ([ADR-0026](../adr/0026-broker-unico-y-pull-del-documento-activo.md)) | Sí        |
| Extensión que lee archivos fuera del workspace  | La API no ofrece filesystem, y lo que ofrece pasa por el main. **Pero el proceso tiene `node:fs`**                                       | No        |
| Extensión que exfiltra código                   | La capability `network` no habilita nada en la API. **Pero el proceso tiene `fetch` y sockets**                                          | No        |
| Extensión que ejecuta otros programas           | Ninguna: el proceso tiene `node:child_process`                                                                                           | No        |
| Extensión que congela el IDE                    | Proceso separado + timeout de 5s en toda llamada de API                                                                                  | Sí        |
| Extensión que tumba la app                      | Proceso separado; el crash se contiene y el host se reinicia                                                                             | Sí        |
| Manifest malicioso o mal formado                | Validación de schema con Zod; capabilities no declaradas = acceso denegado                                                               | Sí        |

Las tres filas en "No" se resuelven confinando el proceso y pidiendo consentimiento antes de cargar una extensión, en el [plan de la etapa 3](../planes/etapa-03-confianza.md). Hasta entonces, instalar una extensión es confiar en ella como en cualquier programa. Lo mismo vale para abrir un repositorio: todavía no hay confianza de workspace, y abrir un `.ts` lanza el `tsserver` del `node_modules` de ese repositorio.

Ver [ADR-0003](../adr/0003-extension-host-aislado.md) y el [manifest de extensión](../05-modelo-de-datos.md#manifest-de-extensión).

> **Estado, Etapa 5.** El modelo dejó de ser una promesa. Las capabilities las hace cumplir **el main**, que es el único proceso que no ejecuta código de terceros y por lo tanto el único cuyo chequeo significa algo: un chequeo del lado del host lo escribiría el mismo que se lo quiere saltear ([ADR-0026](../adr/0026-broker-unico-y-pull-del-documento-activo.md)). Hay tests que verifican que una extensión sin `statusBar` no puede poner un ítem, que una sin `documentWrite` no puede editar, y que **una no puede tocar el ítem de otra** aunque mande su identificador.
>
> Se agregó `documentWrite` al conjunto que el modelo de datos listaba. `documentRead` sola habría obligado a `word-count` a pedir permiso de escritura para no usarlo nunca, que es exactamente cómo los permisos dejan de significar algo.
>
> Lo que **no** está: `network` está declarada y no habilita nada todavía, porque no hay ninguna superficie de red en la API.

---

## Dependencias

- `pnpm audit --audit-level=high` **bloquea el merge** ([RNF-15](../04-requerimientos-no-funcionales.md#seguridad)).
- Dependabot con revisión semanal (`.github/dependabot.yml`): minor y patch agrupados, y los pines de [ADR-0009](../adr/0009-pinear-typescript-y-vite.md) ignorados.
- Un override de pnpm (`pnpm-workspace.yaml`) lleva al lado el aviso que cierra, para poder sacarlo el día que la dependencia directa traiga el arreglo.
- Los workflows de CI declaran `permissions: contents: read` a nivel superior; el job que necesita más lo pide él.
- Cómo reportar una vulnerabilidad: [`SECURITY.md`](../../SECURITY.md).
- Toda dependencia nueva se justifica en el PR: por qué no se resuelve con código propio, cuál es su tamaño, cuándo fue su último release.
- Prohibido agregar dependencias sin mantenimiento en los últimos 12 meses sin justificación explícita.

---

[← Testing](./testing.md) · [Índice](../README.md) · [Build y release →](./build-y-release.md)
