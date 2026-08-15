# ADR-0001: Usar Electron + TypeScript como runtime de escritorio

## Estado

✅ **Aceptado** — 2026-08-14

## Contexto

Se necesita una app de escritorio que distribuya un `.exe`, con acceso a filesystem, capacidad de lanzar procesos hijo (pseudo-terminales, servidores LSP, adaptadores de debug) y rendering de UI compleja y densa en texto.

El proyecto lo desarrolla una sola persona, con TypeScript como lenguaje principal. El objetivo es un producto usable, no un ejercicio de aprendizaje de un lenguaje nuevo.

## Decisión

**Electron con TypeScript** en los tres procesos (main, renderer, extension host).

## Alternativas consideradas

| Opción                     | Pros                                                                                                                                                                                                                  | Contras                                                                                                                                                                                           | Por qué no                                                                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tauri (Rust + WebView)** | Binario ~10x más chico, uso de RAM mucho menor, seguridad por defecto                                                                                                                                                 | El WebView difiere entre SO (WebView2 / WKWebView / WebKitGTK), causando bugs de renderizado de texto; PTY y supervisión de procesos requieren Rust; ecosistema de bindings inmaduro para LSP/DAP | El rendering de texto inconsistente es inaceptable en un editor. El costo de aprender Rust + reescribir el PTY compite directamente con terminar features |
| **Qt / C++**               | Performance nativa real, un solo binario                                                                                                                                                                              | Curva de aprendizaje muy alta, iteración de UI lentísima, licenciamiento comercial confuso                                                                                                        | Duplicaría el timeline sin aportar al objetivo de portfolio (que es demostrar arquitectura, no C++)                                                       |
| **JavaFX / Java**          | Multiplataforma maduro                                                                                                                                                                                                | Ecosistema de LSP/DAP débil, distribución con JRE incómoda, look-and-feel no nativo                                                                                                               | Ninguna ventaja sobre Electron para este caso                                                                                                             |
| **Electron** ✅            | Node en el proceso main da acceso directo a `node-pty`, `child_process` y todo el ecosistema npm de LSP/DAP; Chromium garantiza rendering idéntico en los 3 SO; es exactamente lo que usan VS Code, Cursor y Windsurf | ~150MB de binario, mayor consumo de RAM, requiere disciplina de seguridad explícita                                                                                                               | —                                                                                                                                                         |

## Consecuencias

- ✅ Podemos usar `vscode-languageclient`, `vscode-debugprotocol` y `node-pty` directamente, sin escribir bindings.
- ✅ El rendering es idéntico en Windows, macOS y Linux. Crítico para medición de glifos en un editor.
- ✅ Un solo lenguaje en todo el stack reduce la carga cognitiva de un dev solo.
- ⚠️ El tamaño del instalador y el consumo de RAM se vuelven **requerimientos no funcionales explícitos** ([RNF-04](../04-requerimientos-no-funcionales.md#performance) y [RNF-05](../04-requerimientos-no-funcionales.md#performance)), porque son la crítica obvia a Electron. Medirlos y optimizarlos activamente es parte del valor de portfolio.
- ⚠️ La seguridad (`contextIsolation`, `sandbox`, CSP) pasa a ser responsabilidad nuestra, no del framework. Ver [Convenciones · Seguridad](../convenciones/seguridad.md).
- ❌ Se cierra la puerta a un binario de menos de 20MB. Si eso se volviera un requerimiento duro, habría que reconsiderar Tauri.
