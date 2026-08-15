# 04 — Requerimientos no funcionales

[← Requerimientos funcionales](./03-requerimientos-funcionales.md) · [Índice](./README.md) · [Siguiente: Modelo de datos →](./05-modelo-de-datos.md)

> Los RNF son los que van a distinguir este proyecto. Un IDE que funciona lo hace cualquiera; uno que documenta y cumple presupuestos de performance medibles, no.

---

## Performance

| ID | Requerimiento | Objetivo | Cómo se mide |
|---|---|---|---|
| RNF-01 | Tiempo de arranque en frío hasta interactivo | < 1.5s (p95) | Marca `performance.mark()` desde `app.whenReady` hasta el primer frame pintado, promediado sobre 20 arranques en CI |
| RNF-02 | Latencia de input en el editor | < 16ms (p99) | Test automatizado que mide el delta entre `keydown` y el frame renderizado |
| RNF-03 | Apertura de archivo grande | Archivo de 10MB / 200k líneas abre en < 2s sin congelar la UI | Test E2E con archivo generado |
| RNF-04 | Consumo de RAM en reposo | < 400MB con un workspace de 1.000 archivos y 3 pestañas abiertas | `process.memoryUsage()` reportado en CI |
| RNF-05 | Tamaño del instalador | < 120MB para Windows x64 | Verificado en el pipeline de release; falla el build si excede |
| RNF-06 | La UI nunca se bloquea | Ninguna operación en el hilo del renderer excede 50ms | Long Task API; cualquier violación se loguea en desarrollo |

**Regla de performance:** los presupuestos son parte del CI. Si un PR degrada RNF-01 en más de 10%, el pipeline falla. Se implementa en la [Fase 2](./06-roadmap-y-riesgos.md#fase-2--herramientas-de-desarrollo).

> RNF-04 y RNF-05 existen porque son la crítica obvia a Electron. Medirlos y defenderlos activamente es parte del valor de portfolio. Ver [ADR-0001](./adr/0001-electron-typescript.md).

**Hardware de referencia:** CPU de 4 núcleos ~2.5GHz, 8GB RAM, SSD, Windows 11.

## Confiabilidad

| ID | Requerimiento |
|---|---|
| RNF-07 | Nunca perder datos del usuario. Todo guardado es atómico: escribir a un archivo temporal, luego `rename()`. Un corte de energía a mitad de guardado no puede corromper el archivo original |
| RNF-08 | Auto-guardado de recuperación cada 30s en `~/.pastecode/backups/`. Al reabrir después de un crash, se ofrece restaurar |
| RNF-09 | El crash de cualquier proceso hijo (LSP, DAP, PTY, extension host) es recuperable y no tumba el IDE |
| RNF-10 | Cero procesos huérfanos. Al cerrar la app, todos los hijos reciben `SIGTERM` y luego `SIGKILL` tras 3s. Verificado con test automatizado |

## Seguridad

| ID | Requerimiento |
|---|---|
| RNF-11 | Toda ruta recibida vía IPC se normaliza y valida contra la raíz del workspace. Se rechaza cualquier path traversal (`../../etc/passwd`) |
| RNF-12 | `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` en todos los `BrowserWindow`. Sin excepciones |
| RNF-13 | Content Security Policy estricta con `default-src 'self'` y `object-src 'none'`. Prohibido `unsafe-eval` en cualquier directiva y prohibido `unsafe-inline` en `script-src`. **Única excepción:** `style-src 'unsafe-inline'`, que Monaco requiere para inyectar estilos dinámicamente — documentada en [ADR-0002](./adr/0002-monaco-editor.md) y revisada en cada actualización de Monaco |
| RNF-14 | Las extensiones declaran capabilities en su manifest. Sin declaración, sin acceso |
| RNF-15 | Cero dependencias con vulnerabilidades críticas o altas. `npm audit` corre en CI y bloquea el merge |

> La implementación de estas reglas está en [Convenciones · Seguridad](./convenciones/seguridad.md).

## Mantenibilidad

| ID | Requerimiento |
|---|---|
| RNF-16 | TypeScript en modo `strict`. Cero usos de `any` sin un comentario `// eslint-disable-next-line` justificado |
| RNF-17 | Cobertura de tests ≥ 80% en `packages/core`, ≥ 60% global |
| RNF-18 | Cero warnings de ESLint en `main` |
| RNF-19 | Toda función pública exportada tiene JSDoc con `@param`, `@returns` y al menos un `@example` |
| RNF-20 | Ningún archivo excede 400 líneas. Ninguna función excede 50 líneas. Complejidad ciclomática máxima: 10 |

> Ver [Convenciones · Código](./convenciones/codigo.md) y [Convenciones · Testing](./convenciones/testing.md).

## Usabilidad y accesibilidad

| ID | Requerimiento |
|---|---|
| RNF-21 | Toda acción de la UI es alcanzable por teclado. Sin trampas de foco |
| RNF-22 | Contraste de color WCAG AA (4.5:1) en ambos temas incluidos |
| RNF-23 | Roles y labels ARIA correctos en todos los componentes custom |
| RNF-24 | Toda operación que exceda 500ms muestra feedback de progreso |
| RNF-25 | Todo error visible al usuario incluye qué pasó y qué puede hacer al respecto. Prohibido mostrar stack traces crudos |

## Compatibilidad

| ID | Requerimiento |
|---|---|
| RNF-26 | Windows 10 (1809+) y 11, x64 y arm64 — **plataforma primaria** |
| RNF-27 | macOS 12+ (Intel y Apple Silicon) — soportada |
| RNF-28 | Linux: Ubuntu 22.04+ y derivadas, vía AppImage y `.deb` — best effort |
| RNF-29 | Toda la arquitectura soporta i18n desde el día 1 (sin strings hardcodeados en la UI), aunque sólo se envíen `en` y `es` |

---

[← Requerimientos funcionales](./03-requerimientos-funcionales.md) · [Índice](./README.md) · [Siguiente: Modelo de datos →](./05-modelo-de-datos.md)
