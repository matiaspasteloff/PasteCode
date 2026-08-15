# Convenciones · Seguridad

[← Testing](./testing.md) · [Índice](../README.md) · [Build y release →](./build-y-release.md)

> Electron no es seguro por defecto. Al elegirlo ([ADR-0001](../adr/0001-electron-typescript.md)) aceptamos que el hardening es responsabilidad nuestra.

---

## Configuración obligatoria de Electron

```typescript
// apps/desktop/src/main/windows/create-window.ts
const window = new BrowserWindow({
  webPreferences: {
    nodeIntegration: false,        // NUNCA true
    contextIsolation: true,        // NUNCA false
    sandbox: true,                 // NUNCA false
    webSecurity: true,             // NUNCA false
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
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self';
               script-src 'self';
               style-src 'self' 'unsafe-inline';
               img-src 'self' data:;
               connect-src 'self';
               font-src 'self';
               object-src 'none';
               base-uri 'none';">
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

> **Por qué `realpath`:** sin resolver symlinks, un atacante puede crear `workspace/link → /etc` y escapar pasando una ruta que *parece* estar adentro.

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

## Modelo de amenazas — extensiones

Las extensiones son código de terceros con acceso a la API. El modelo de seguridad:

| Amenaza | Mitigación |
|---|---|
| Extensión que lee archivos fuera del workspace | Toda operación de fs pasa por el main, que valida contra el workspace |
| Extensión que exfiltra código | Capability `network` requerida y declarada en el manifest; el usuario la ve al instalar |
| Extensión que congela el IDE | Proceso separado + timeout de 5s en toda llamada de API |
| Extensión que tumba la app | Proceso separado; el crash se contiene y el host se reinicia |
| Extensión maliciosa en el manifest | Validación de schema; capabilities no declaradas = acceso denegado |

Ver [ADR-0003](../adr/0003-extension-host-aislado.md) y el [manifest de extensión](../05-modelo-de-datos.md#manifest-de-extensión).

---

## Dependencias

- `npm audit --audit-level=high` **bloquea el merge** ([RNF-15](../04-requerimientos-no-funcionales.md#seguridad)).
- Dependabot activado con revisión semanal.
- Toda dependencia nueva se justifica en el PR: por qué no se resuelve con código propio, cuál es su tamaño, cuándo fue su último release.
- Prohibido agregar dependencias sin mantenimiento en los últimos 12 meses sin justificación explícita.

---

[← Testing](./testing.md) · [Índice](../README.md) · [Build y release →](./build-y-release.md)
