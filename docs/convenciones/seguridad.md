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

// Bloquear navegación a cualquier origen externo
window.webContents.on('will-navigate', (event, url) => {
  if (!url.startsWith('file://')) event.preventDefault();
});

// Los links externos abren en el navegador del sistema, nunca en la app
window.webContents.setWindowOpenHandler(({ url }) => {
  if (isSafeExternalUrl(url)) shell.openExternal(url);
  return { action: 'deny' };
});
```

Satisface [RNF-12](../04-requerimientos-no-funcionales.md#seguridad). **Sin excepciones, en ninguna ventana, ni siquiera para debugging.**

---

## Content Security Policy

```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self';
               script-src 'self';
               style-src 'self' 'unsafe-inline';
               img-src 'self' data:;
               connect-src 'self';
               font-src 'self';
               object-src 'none';
               base-uri 'none';"
/>
```

`unsafe-inline` en `style-src` es una concesión a Monaco, que inyecta estilos dinámicamente. Se documenta como **excepción conocida** y se revisa en cada actualización de Monaco. Ver [ADR-0002](../adr/0002-monaco-editor.md).

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

---

## Procesos hijo y binarios externos

PasteCode lanza procesos que no escribió: el shell de la terminal, `ripgrep`, y en las etapas siguientes los servidores de LSP y los adaptadores de DAP. Cada uno es una decisión de "ejecutar esto" y ninguna es inocente, porque **el nombre del ejecutable puede venir de un archivo del proyecto** y un `.pastecode/settings.json` viaja adentro de cualquier repositorio que se clone.

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

### `terminal.shell` va contra una allow-list

Cuando el setting exista, la regla es:

- El valor por defecto es el shell del sistema operativo, resuelto como arriba.
- Un valor distinto tiene que ser una **ruta absoluta a un archivo que exista**, y se le pide confirmación explícita al usuario la primera vez.
- **Un `.pastecode/settings.json` de workspace no puede elegir el ejecutable.** Es la única clave del schema con esa restricción, y existe porque clonar un repositorio no puede ser lo mismo que aceptar ejecutar lo que el repositorio diga. La precedencia normal —workspace le gana a usuario— se invierte para esta clave.

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

Las extensiones son código de terceros con acceso a la API. El modelo de seguridad:

| Amenaza                                        | Mitigación                                                                              |
| ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| Extensión que lee archivos fuera del workspace | Toda operación de fs pasa por el main, que valida contra el workspace                   |
| Extensión que exfiltra código                  | Capability `network` requerida y declarada en el manifest; el usuario la ve al instalar |
| Extensión que congela el IDE                   | Proceso separado + timeout de 5s en toda llamada de API                                 |
| Extensión que tumba la app                     | Proceso separado; el crash se contiene y el host se reinicia                            |
| Extensión maliciosa en el manifest             | Validación de schema; capabilities no declaradas = acceso denegado                      |

Ver [ADR-0003](../adr/0003-extension-host-aislado.md) y el [manifest de extensión](../05-modelo-de-datos.md#manifest-de-extensión).

---

## Dependencias

- `npm audit --audit-level=high` **bloquea el merge** ([RNF-15](../04-requerimientos-no-funcionales.md#seguridad)).
- Dependabot activado con revisión semanal.
- Toda dependencia nueva se justifica en el PR: por qué no se resuelve con código propio, cuál es su tamaño, cuándo fue su último release.
- Prohibido agregar dependencias sin mantenimiento en los últimos 12 meses sin justificación explícita.

---

[← Testing](./testing.md) · [Índice](../README.md) · [Build y release →](./build-y-release.md)
