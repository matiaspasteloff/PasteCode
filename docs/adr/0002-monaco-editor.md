# ADR-0002: Usar Monaco Editor como núcleo de edición

## Estado

✅ **Aceptado** — 2026-08-14

## Contexto

El núcleo de un editor de código —renderizado virtualizado de miles de líneas, medición de glifos, multi-cursor, folding, tokenización incremental— representa años-persona de trabajo. Es también la parte menos diferenciadora: todos los editores modernos resuelven esto de forma similar.

Hay una tensión real acá. Escribirlo desde cero luciría técnicamente, pero consumiría el proyecto entero.

## Decisión

Usar **`monaco-editor`** como componente de edición.

## Alternativas consideradas

| Opción                       | Pros                                                                                                                       | Contras                                                                                                                                        | Por qué no                                                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **CodeMirror 6**             | API moderna y modular, bundle más chico, excelente arquitectura de extensiones                                             | Menos features "de IDE" out-of-the-box (peor soporte de multi-cursor complejo, sin minimapa nativo), integración LSP requiere adaptador propio | Opción legítima; se descarta porque Monaco trae la integración LSP y las features de IDE ya resueltas                                |
| **Editor propio desde cero** | Máximo lucimiento técnico                                                                                                  | 6-12 meses sólo para llegar a paridad básica                                                                                                   | Consumiría todo el proyecto. El diferencial de portfolio está en la **arquitectura del IDE**, no en reimplementar rendering de texto |
| **Monaco** ✅                | Es literalmente el editor de VS Code; multi-cursor, minimapa, folding y tokenización ya resueltos; integración LSP directa | Bundle grande (~5MB), API con partes poco documentadas, difícil de customizar en profundidad                                                   | —                                                                                                                                    |

## Consecuencias

- ✅ Se gana aproximadamente 6 meses de trabajo, que se redirigen a la arquitectura de extensiones y la supervisión de procesos.
- ✅ El comportamiento del editor es el que los usuarios ya conocen de VS Code. Cero curva de aprendizaje.
- ⚠️ Monaco no soporta bien el modelo de "un editor por pestaña con estado independiente" sin cuidado; se debe implementar un `EditorModelRegistry` que reutilice modelos. Ver [RF-102](../03-requerimientos-funcionales.md#editor).
- ⚠️ El bundle de ~5MB presiona contra [RNF-05](../04-requerimientos-no-funcionales.md#performance) (instalador < 120MB). Requiere lazy loading de los workers de lenguaje.
- ⚠️ `unsafe-inline` en `style-src` de la CSP es una concesión a Monaco, que inyecta estilos dinámicamente. Documentada como excepción conocida en [Seguridad](../convenciones/seguridad.md#content-security-policy).
- ⚠️ **Riesgo de portfolio:** un revisor puede decir "usaste el editor de VS Code". La respuesta está en este ADR y en el hecho de que el valor está en la arquitectura de host de extensiones, IPC y process supervision. Conviene poder defender ese argumento en una entrevista.
