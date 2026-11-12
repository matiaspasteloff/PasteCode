# Informe de auditoría — noviembre 2026

[Índice](../README.md) · [Planes de ejecución →](../planes/README.md)

> Auditoría del repositorio en la versión `0.3.1` (commit `1189b7d`). Cubre seguridad, distribución, funcionalidades, diseño e interactividad, y tipografías. Cada hallazgo lleva su evidencia —archivo y, donde aplica, línea— para que se pueda verificar sin confiar en este documento.
>
> Lo que sale de acá está planificado en [`docs/planes/`](../planes/README.md), una etapa por archivo.

---

## Método

Lectura estática del código y de la documentación, más consultas de sólo lectura a GitHub (releases, tags, visibilidad). **No se ejecutó la aplicación ni la suite de tests**: todo lo que este informe afirma sobre comportamiento en runtime está marcado como _a confirmar_ y tiene asignada su verificación en el plan de la etapa correspondiente.

## Estado real

Electron 43 + React 19 + Monaco 0.56, monorepo pnpm 11 + Turborepo. Fases 0 a 4 cerradas —editor, terminal, búsqueda, LSP, Git, extensiones y DAP— más la Etapa Experimental 1 (asistente de IA, barra de título propia, temas).

**La Fase 5 (lanzamiento) no empezó: el repositorio tiene 0 releases y 0 tags publicados.** Nadie fuera de quien clona y compila puede usar PasteCode hoy.

## Lo que está bien y no se toca

Vale dejarlo escrito, porque es lo que las etapas siguientes tienen prohibido romper:

- `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, sin excepciones (`main/windows/create-window.ts`).
- El preload expone sólo `invoke` y `subscribe`, con allow-list de eventos en runtime (`preload/index.ts`).
- Todo canal valida con Zod estricto y devuelve `IpcResult`; un error inesperado cruza opaco (`main/ipc/handler.ts`).
- `resolveInsideWorkspace` resuelve el ancestro real más profundo y cierra el agujero del fallback de `realpath` (`main/services/path-guard.ts`).
- El renderer se sirve por `pastecode://` con la CSP emitida como header desde el main (ADR-0012).
- Toda la política relajada de desarrollo cuelga de `!app.isPackaged` (`main/environment.ts`).
- Los ejecutables se resuelven por ruta absoluta verificada, y las settings que eligen qué se ejecuta no las puede escribir el workspace (`packages/core/src/settings/merge.ts`).
- El workspace sólo se abre por diálogo nativo: el renderer no puede mandar una ruta raíz (`main/ipc/workspace.ts`).
- La clave de IA vive en `safeStorage` y nunca vuelve al renderer; el filtro de modelos gratuitos existe también del lado del main.
- `pnpm audit` bloquea el merge; `allowBuilds` y `minimumReleaseAge` de pnpm están configurados a conciencia.
- Presupuestos de performance absolutos en CI; 32 ADRs; contraste verificado por script.

---

## Seguridad

| #   | Sev.     | Hallazgo                                                                                                                                                                                                                                                                                                                                                       | Evidencia                                                                                      | Etapa |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----- |
| S1  | **Alta** | Las extensiones corren con **Node completo**. El host es un `utilityProcess` que hace `import()` del módulo de la extensión: `node:fs`, `node:child_process` y `fetch` están disponibles. Las capabilities limitan la API propia, no el proceso. Las de `~/.pastecode/extensions/` se cargan solas al arrancar, sin consentimiento ni forma de deshabilitarlas | `packages/extension-host/src/runtime.ts` (`importExtension`), `main/extensions/directories.ts` | 3     |
| S2  | **Alta** | **No hay confianza de workspace.** Abrir una carpeta y después un `.ts` lanza el `tsserver` de **ese** `node_modules`, sin preguntar. Clonar un repositorio y abrir un archivo alcanza para ejecutar código suyo                                                                                                                                               | `main/lsp/resolve-server-path.ts:181-200`                                                      | 3     |
| S3  | Media    | Sin `setPermissionRequestHandler` ni `setPermissionCheckHandler`. Electron concede por omisión los permisos de Chromium (cámara, micrófono, geolocalización, notificaciones)                                                                                                                                                                                   | 0 coincidencias en `apps/desktop/src`                                                          | 1     |
| S4  | Media    | **Fuses de Electron sin configurar.** El binario instalado obedece `NODE_OPTIONS` y `--inspect`, y no valida la integridad del asar                                                                                                                                                                                                                            | `apps/desktop/electron-builder.yml`                                                            | 1     |
| S5  | Media    | Nunca se quita el menú de aplicación por omisión de Electron, que trae recargar y abrir DevTools. _A confirmar_ si sus aceleradores siguen activos en la ventana sin marco. Indicio: `ctrl+w` sólo está ligado `when: hasOpenTab`, así que sin pestañas la tecla cae al menú                                                                                   | 0 usos de `Menu.` en `main/`; `renderer/features/commands/default-keybindings.ts`              | 1     |
| S6  | Media    | El bloqueo de navegación y de ventanas nuevas está atado sólo a la ventana principal. No hay guarda global `web-contents-created`, ni `will-attach-webview`, ni `will-redirect`                                                                                                                                                                                | `main/windows/create-window.ts`                                                                | 1     |
| S7  | Media    | Binarios sin firma **y sin procedencia verificable** —ni checksums ni attestation—, y sin auto-update: un arreglo de seguridad no le llega a nadie                                                                                                                                                                                                             | No existe `release.yml`; `electron-updater` no es dependencia                                  | 2     |
| S8  | Baja     | La CSP no declara `form-action` ni `frame-ancestors`, que no heredan de `default-src`                                                                                                                                                                                                                                                                          | `main/security/content-security-policy.ts`                                                     | 1     |
| S9  | Baja     | Sin bloqueo de instancia única: dos instancias compiten por los archivos de sesión, settings, backups y credenciales                                                                                                                                                                                                                                           | `main/index.ts`                                                                                | 1     |
| S10 | Baja     | `seguridad.md` dice "Dependabot activado con revisión semanal" y no existe `dependabot.yml`. Tampoco `SECURITY.md`. Los workflows no declaran `permissions` a nivel superior                                                                                                                                                                                   | `.github/`                                                                                     | 1     |
| S11 | Baja     | En Linux, `safeStorage` puede caer al backend `basic_text`, que equivale a texto plano. `isEncryptionAvailable()` devuelve `true` igual. Importa recién al publicar para Linux                                                                                                                                                                                 | `main/ai/credentials.ts`                                                                       | 1     |
| S12 | Baja     | Deriva de documentación: `seguridad.md` todavía muestra `url.startsWith('file://')` y la CSP por `<meta>`. El código real es más estricto que su propia norma                                                                                                                                                                                                  | `docs/convenciones/seguridad.md:24-53`                                                         | 1     |
| S13 | Baja     | La documentación de la API le promete al autor de extensiones algo que S1 desmiente: _"No hay acceso al filesystem. Ni a `node:fs` de forma útil"_. La tabla de amenazas de `seguridad.md` repite la promesa                                                                                                                                                   | `docs/extension-api/README.md:279`, `docs/convenciones/seguridad.md` (modelo de amenazas)      | 1 y 3 |

**Por qué S1 y S2 son las que importan.** El resto del modelo de seguridad está construido contra un renderer comprometido, y está bien construido. Pero las dos formas realistas de que código ajeno corra en la máquina de alguien no pasan por el renderer: pasan por instalar una extensión y por abrir un repositorio clonado. Las dos terminan hoy en ejecución de código con los permisos del usuario.

## Instalador y distribución

| #   | Hallazgo                                                                                                                                                                                                             | Evidencia                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| D1  | Un solo destino: NSIS para Windows x64, con asistente (`oneClick: false`). `build-y-release.md` y RNF-26/27/28 declaran arm64, macOS y Linux                                                                         | `apps/desktop/electron-builder.yml`                                                          |
| D2  | **Bug de empaquetado.** La app instalada busca las extensiones incorporadas en `process.resourcesPath/extensions`, y la configuración no tiene `extraResources`. El `.exe` sale **sin** `theme-nord` ni `word-count` | `main/extensions/directories.ts` contra `electron-builder.yml`. _A confirmar con un paquete_ |
| D3  | **Sin ícono.** No existe `apps/desktop/build/`: instalador y ejecutable llevan el ícono de Electron                                                                                                                  | `directories.buildResources: build`                                                          |
| D4  | Sin workflow de release, sin `CHANGELOG`, sin auto-update. El proceso documentado menciona `changesets`, que no está instalado                                                                                       | `.github/workflows/`, `docs/convenciones/build-y-release.md`                                 |
| D5  | **No es portable tal cual.** Los tres botones de ventana son glifos de la fuente _Segoe Fluent Icons_, que sólo existe en Windows. Y `frame: false` deja a macOS sin semáforo y sin el menú de edición que necesita  | `renderer/components/WindowControls.tsx`, `renderer/styles/global.css:274`                   |
| D6  | El E2E sólo corre en Windows; los tests unitarios corren en los tres sistemas. Nada verifica que la app arranque en macOS o Linux                                                                                    | `.github/workflows/ci.yml`                                                                   |

## Funcionalidades

**Cinco settings se aceptan y se ignoran en silencio.** El schema las valida, el archivo las guarda, y ningún código las lee:

| Setting                        | Dónde se declara                       | Quién la lee |
| ------------------------------ | -------------------------------------- | ------------ |
| `files.autoSave`               | `packages/core/src/settings/schema.ts` | nadie        |
| `files.autoSaveDelay`          | ídem                                   | nadie        |
| `files.trimTrailingWhitespace` | ídem                                   | nadie        |
| `editor.formatOnSave`          | ídem                                   | nadie        |
| `window.zoomLevel`             | ídem                                   | nadie        |

Es exactamente lo que el propio schema dice querer evitar cuando rechaza claves desconocidas: un valor que se ignora sin avisar.

**Requerimientos pendientes**, por prioridad:

| Prioridad | Requerimientos                                                                                                                                                                                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `M`       | RF-508 (adaptador de Node integrado), parcial a propósito                                                                                                                                                                                                                                                                      |
| `S`       | RF-006 drag & drop · RF-110 breadcrumbs · RF-204 reemplazar en archivos · RF-306 links en la terminal · RF-406 a RF-409 referencias, renombrar, formatear, code actions · RF-506/507 breakpoints condicionales y watch · RF-607/608 diff y pull/push · RF-706 UI de settings · RF-804 ligaduras · RF-910 habilitar extensiones |
| `C`       | RF-111 modo zen · RF-307 perfiles de terminal · RF-609 historial · RF-1009 persistir conversaciones                                                                                                                                                                                                                            |
| RNF       | RNF-29 pide enviar `en` y `es`; sólo existe `renderer/i18n/es.ts` y `<html lang="es">` está fijo                                                                                                                                                                                                                               |

**Documentación desactualizada:** el `README.md` dice "Etapa 2 cerrada"; el roadmap marca el CI de la Fase 0 como no verificado; el árbol de `docs/README.md` lista 6 de los 32 ADRs.

## Diseño e interactividad

- **Ningún panel se puede redimensionar.** La barra lateral, el panel inferior y el del asistente tienen el tamaño fijo en variables CSS (`--sidebar-width`, `--bottom-panel-height`, `--ai-panel-width`).
- **Sin menús contextuales.** Renombrar y eliminar en el árbol existen sólo por teclado (`F2`, `Delete`); no hay un solo `onContextMenu` en el renderer.
- **Sin sistema de notificaciones.** Cada feature muestra sus errores donde puede.
- **Sin pantalla de bienvenida.** El estado vacío es un párrafo; no hay carpetas recientes.
- **Sin vista de extensiones.** Lo cargado se ve sólo en un ítem de la barra de estado.
- **Sin drag & drop**, ni de pestañas ni en el árbol.
- `global.css` es un archivo de 2.132 líneas, con una docena de tamaños de letra escritos a mano (`0.6rem` a `1rem`) y sin escala tipográfica en los tokens.

## Tipografías

| Dónde                                          | Pila                                                                | Problema                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------- |
| Token `--font-mono` (`tokens.css`)             | `ui-monospace, 'Cascadia Mono', Consolas, 'Courier New', monospace` | Es la única razonable, y no la usan ni el editor ni la terminal |
| Default de `editor.fontFamily`                 | `Consolas, "Courier New", monospace`                                | En macOS y Linux cae a Courier                                  |
| Terminal (`features/terminal/use-terminal.ts`) | `Consolas, "Cascadia Mono", monospace`                              | Escrita en el código; no hay setting                            |
| Botones de ventana                             | `'Segoe Fluent Icons', 'Segoe MDL2 Assets'`                         | Fuente de íconos exclusiva de Windows (ver D5)                  |
| UI (`--font-ui`)                               | `'Segoe UI', system-ui, sans-serif`                                 | Correcta                                                        |

Son **tres pilas monoespaciadas distintas** para lo que debería ser una decisión. No hay soporte de ligaduras (RF-804).

El comentario de `tokens.css` descarta empaquetar una fuente porque "son megabytes contra el techo de RNF-05". Una variable en `woff2` pesa unos 300KB; la decisión puede ser la misma, pero la premisa no es exacta.

---

## Qué sigue

El detalle está en [`docs/planes/`](../planes/README.md). El orden, y por qué:

1. **Hardening** (S3 a S12) — barato, sin decisiones de producto, y deja la base lista para publicar.
2. **Instalador y releases** (S7, D1 a D6) — sin esto ninguna otra mejora le llega a nadie.
3. **Modelo de confianza** (S1, S2) — antes del primer release estable; hasta entonces los releases salen como `-beta`.
4. **Deuda barata, tipografías e idioma.**
5. y 6. **Diseño e interactividad.**
6. y 8. **Emulador de Android**, como Etapa Experimental 2.
7. y 10. **Funcionalidades de IDE pendientes.**
8. **Cierre de la Fase 5.**
