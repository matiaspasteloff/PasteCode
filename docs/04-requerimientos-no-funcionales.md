# 04 — Requerimientos no funcionales

[← Requerimientos funcionales](./03-requerimientos-funcionales.md) · [Índice](./README.md) · [Siguiente: Modelo de datos →](./05-modelo-de-datos.md)

> Los RNF son los que van a distinguir este proyecto. Un IDE que funciona lo hace cualquiera; uno que documenta y cumple presupuestos de performance medibles, no.

---

## Performance

| ID     | Requerimiento                                | Objetivo                                                                                                                             | Cómo se mide                                                                                                                  |
| ------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| RNF-01 | Tiempo de arranque en frío hasta interactivo | < 1.5s (p95)                                                                                                                         | `e2e/perf/startup.perf.ts`: 20 arranques, p95 del tiempo hasta el primer contenido                                            |
| RNF-02 | Latencia de input en el editor               | < 16ms (p99)                                                                                                                         | `e2e/perf/input-latency.perf.ts`: delta entre `keydown` y el `requestAnimationFrame` siguiente, 120 pulsaciones               |
| RNF-03 | Apertura de archivo grande                   | Archivo de 10MB / 200k líneas abre en < 2s sin congelar la UI                                                                        | `e2e/tests/performance.spec.ts`, con archivo generado                                                                         |
| RNF-04 | Consumo de RAM en reposo                     | **< 400MB sin servidores de lenguaje** y **< 700MB con TypeScript activo**, con un workspace de 1.000 archivos y 3 pestañas abiertas | `e2e/perf/memory.perf.ts`: suma de `privateBytes` de **todos** los procesos, vía `app.getAppMetrics()`, en los dos escenarios |
| RNF-05 | Tamaño del instalador                        | < 120MB para Windows x64                                                                                                             | Job `build` del CI, sobre el `.exe` recién generado; falla el build si excede                                                 |
| RNF-06 | La UI nunca se bloquea                       | Ninguna operación en el hilo del renderer excede 50ms                                                                                | Long Task API; cualquier violación se loguea en desarrollo                                                                    |

**Regla de performance: los presupuestos son absolutos y no relativos.** El job `perf-budget` del CI mide en cada PR y falla si un número supera su presupuesto, sin comparar contra `main`. Los valores quedan en el resumen del job y en un comentario del PR.

> **Nota de corrección, Etapa 3.** La redacción original decía _"si un PR degrada RNF-01 en más de 10%, el pipeline falla"_, que implica comparar contra una medición de `main`. Se reescribió como presupuesto absoluto: comparar dos corridas de un runner compartido mide la varianza del runner, no la del código, y además deja pasar las regresiones chicas y acumulativas —diez PRs de 9% cada uno duplican el tiempo de arranque sin que ninguno falle—. Ver [ADR-0015](./adr/0015-presupuestos-absolutos-de-performance.md).

> **Nota de método (RNF-04), Etapa 3.** Se suma `privateBytes` y no `workingSetSize`: el working set de cada proceso incluye las páginas **compartidas** de Chromium, así que sumarlo entre los cuatro procesos las cuenta cuatro veces. En una corrida real la diferencia fue 409MB por working set contra 307MB por memoria privada. El presupuesto no se movió; lo que se corrigió fue el doble conteo.

> **Nota de método (RNF-04), Etapa 4.** El presupuesto se partió en dos. `tsserver` sobre un proyecto real ocupa 150-300MB **él solo**, así que un único número obligaba a elegir entre un techo incumplible en cuanto alguien abre un `.ts` —el caso de uso central— y uno tan alto que dejaba de decir nada sobre la aplicación sin LSP. Los dos son absolutos, como pide [ADR-0015](./adr/0015-presupuestos-absolutos-de-performance.md), y los dos se miden en la misma corrida. La diferencia entre ellos **es** cuánto cuesta la inteligencia de lenguaje. Ver [ADR-0021](./adr/0021-presupuesto-de-ram-partido.md).

> **Medición (RNF-04 y RNF-01), Etapa 5 — spike S2.** El extension host ocupa **64,5MB de memoria privada** en reposo, medido con `app.getAppMetrics()` sobre una app recién arrancada. Es el 16% del presupuesto de 400MB, y la corrida completa de `memory.perf.ts` con 1.000 archivos y 3 pestañas quedó en **396,78MB: 3,2MB de margen**. El presupuesto **no se movió** —mover un techo para que pase un test es exactamente lo que [ADR-0015](./adr/0015-presupuestos-absolutos-de-performance.md) evita—, pero queda anotado como el riesgo más cerca de morder de toda la etapa.
>
> Sobre RNF-01 el host **no** pesa: 640,65ms contra 1.500ms de presupuesto, p95 sobre 20 arranques. No es casualidad: se forkea **después** de crear la ventana, así que el arranque no lo espera. Antes de eso se forkeaba primero, y además de costar tiempo el evento de extensiones cargadas se emitía sin ninguna ventana escuchando.
>
> **La decisión que S2 tenía que tomar era si forkearlo perezosamente, y la respuesta es que no alcanza.** El fork perezoso sólo ahorra en instalaciones sin ninguna extensión con código, y la instalación por omisión trae `word-count`, que sí tiene. Lo que la medición sí obliga es a decidir, antes de la Etapa 6, entre partir RNF-04 como se partió por `tsserver` ([ADR-0021](./adr/0021-presupuesto-de-ram-partido.md)) o bajar de verdad lo que ocupa la aplicación. Queda abierto **a propósito**: es una decisión de producto, no de implementación.
>
> La mitigación es parte del presupuesto y no un extra: `lsp.idleShutdownMinutes` apaga a los 5 minutos un servidor que nadie usa.

> RNF-04 y RNF-05 existen porque son la crítica obvia a Electron. Medirlos y defenderlos activamente es parte del valor de portfolio. Ver [ADR-0001](./adr/0001-electron-typescript.md).

**Hardware de referencia:** CPU de 4 núcleos ~2.5GHz, 8GB RAM, SSD, Windows 11.

## Confiabilidad

| ID     | Requerimiento                                                                                                                                                                                                                                                                                                        |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RNF-07 | Nunca perder datos del usuario. Todo guardado es atómico: escribir a un archivo temporal, luego `rename()`. Un corte de energía a mitad de guardado no puede corromper el archivo original                                                                                                                           |
| RNF-08 | Auto-guardado de recuperación cada 30s en `~/.pastecode/backups/`. Al reabrir después de un crash, se ofrece restaurar                                                                                                                                                                                               |
| RNF-09 | El crash de cualquier proceso hijo (LSP, DAP, PTY, extension host) es recuperable y no tumba el IDE. **Alcance, Etapa 4:** cubierto para PTY y LSP —tres reintentos con backoff, health check pasivo, y un estado `failed` visible al rendirse—; DAP y extension host llegan en la Etapa 5 sobre el mismo supervisor |
| RNF-10 | Cero procesos huérfanos. Al cerrar la app, todos los hijos reciben `SIGTERM` y luego `SIGKILL` tras 3s. Verificado con test automatizado                                                                                                                                                                             |

## Seguridad

| ID     | Requerimiento                                                                                                                                                                                                                                                                                                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RNF-11 | Toda ruta recibida vía IPC se normaliza y valida contra la raíz del workspace. Se rechaza cualquier path traversal (`../../etc/passwd`)                                                                                                                                                                                                                                                    |
| RNF-12 | `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` en todos los `BrowserWindow`. Sin excepciones                                                                                                                                                                                                                                                                          |
| RNF-13 | Content Security Policy estricta con `default-src 'self'` y `object-src 'none'`. Prohibido `unsafe-eval` en cualquier directiva y prohibido `unsafe-inline` en `script-src`. **Única excepción:** `style-src 'unsafe-inline'`, que Monaco requiere para inyectar estilos dinámicamente — documentada en [ADR-0002](./adr/0002-monaco-editor.md) y revisada en cada actualización de Monaco |
| RNF-14 | Las extensiones declaran capabilities en su manifest. Sin declaración, sin acceso                                                                                                                                                                                                                                                                                                          |
| RNF-15 | Cero dependencias con vulnerabilidades críticas o altas. `npm audit` corre en CI y bloquea el merge                                                                                                                                                                                                                                                                                        |

> **Nota de alcance (RNF-13), Etapa 3.** La excepción de `style-src 'unsafe-inline'` la usan ahora **dos** librerías, no una: xterm calcula el alto de fila y el ancho de celda en runtime y los escribe como estilo inline, igual que Monaco. No se relaja nada nuevo —la directiva ya estaba— pero deja de ser cierto que sacar Monaco alcance para volver a cerrarla. Ver la tabla de [excepciones conocidas de la CSP](./convenciones/seguridad.md#excepciones-conocidas-de-la-csp).

> **Nota de alcance (RNF-10), Etapa 3.** La redacción —`SIGTERM` y luego `SIGKILL` a los 3s— describe el comportamiento POSIX. **En Windows no hay señales:** conpty termina la consola entera con un `kill()` sin argumentos, y pasarle una señal lanza. La escalación de dos fases existe igual en las dos plataformas; lo que cambia es con qué se pide. Ver [Procesos hijo y binarios externos](./convenciones/seguridad.md#procesos-hijo-y-binarios-externos).

> La implementación de estas reglas está en [Convenciones · Seguridad](./convenciones/seguridad.md).

## Mantenibilidad

| ID     | Requerimiento                                                                                               |
| ------ | ----------------------------------------------------------------------------------------------------------- |
| RNF-16 | TypeScript en modo `strict`. Cero usos de `any` sin un comentario `// eslint-disable-next-line` justificado |
| RNF-17 | Cobertura de tests ≥ 80% en `packages/core`, ≥ 60% global                                                   |
| RNF-18 | Cero warnings de ESLint en `main`                                                                           |
| RNF-19 | Toda función pública exportada tiene JSDoc con `@param`, `@returns` y al menos un `@example`                |
| RNF-20 | Ningún archivo excede 400 líneas. Ninguna función excede 50 líneas. Complejidad ciclomática máxima: 10      |

> Ver [Convenciones · Código](./convenciones/codigo.md) y [Convenciones · Testing](./convenciones/testing.md).

## Usabilidad y accesibilidad

| ID     | Requerimiento                                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------------- |
| RNF-21 | Toda acción de la UI es alcanzable por teclado. Sin trampas de foco                                                 |
| RNF-22 | Contraste de color WCAG AA (4.5:1) en ambos temas incluidos                                                         |
| RNF-23 | Roles y labels ARIA correctos en todos los componentes custom                                                       |
| RNF-24 | Toda operación que exceda 500ms muestra feedback de progreso                                                        |
| RNF-25 | Todo error visible al usuario incluye qué pasó y qué puede hacer al respecto. Prohibido mostrar stack traces crudos |

## Compatibilidad

| ID     | Requerimiento                                                                                                           |
| ------ | ----------------------------------------------------------------------------------------------------------------------- |
| RNF-26 | Windows 10 (1809+) y 11, x64 y arm64 — **plataforma primaria**                                                          |
| RNF-27 | macOS 12+ (Intel y Apple Silicon) — soportada                                                                           |
| RNF-28 | Linux: Ubuntu 22.04+ y derivadas, vía AppImage y `.deb` — best effort                                                   |
| RNF-29 | Toda la arquitectura soporta i18n desde el día 1 (sin strings hardcodeados en la UI), aunque sólo se envíen `en` y `es` |

---

[← Requerimientos funcionales](./03-requerimientos-funcionales.md) · [Índice](./README.md) · [Siguiente: Modelo de datos →](./05-modelo-de-datos.md)
