# Architecture Decision Records

[← Índice de documentación](../README.md)

Un ADR registra una decisión técnica relevante, el contexto en el que se tomó, las alternativas que se descartaron y las consecuencias que trae. No se editan una vez aceptados: si una decisión cambia, se escribe un ADR nuevo que reemplaza al anterior.

**Por qué importan acá:** para un proyecto de portfolio, los ADRs son a menudo lo más valioso del repo. Muestran cómo pensás, no sólo qué escribís.

## Registro

| #                                          | Título                                                                              | Estado       |
| ------------------------------------------ | ----------------------------------------------------------------------------------- | ------------ |
| [0001](./0001-electron-typescript.md)      | Usar Electron + TypeScript como runtime de escritorio                               | ✅ Aceptado  |
| [0002](./0002-monaco-editor.md)            | Usar Monaco Editor como núcleo de edición                                           | ✅ Aceptado  |
| [0003](./0003-extension-host-aislado.md)   | Extension host en un proceso separado                                               | ✅ Aceptado  |
| 0004                                       | Estrategia de gestión de estado en el renderer (Zustand vs. servicios con DI)       | ⏳ Pendiente |
| 0005                                       | Formato de persistencia de settings (JSON con schema vs. TOML)                      | ⏳ Pendiente |
| [0006](./0006-electron-vite-como-build.md) | Usar electron-vite como herramienta de build                                        | ✅ Aceptado  |
| 0007                                       | Modelo de threading para búsqueda en workspace (worker threads vs. ripgrep externo) | ⏳ Pendiente |
| 0008                                       | Mecanismo de auto-update (electron-updater + GitHub Releases)                       | ⏳ Pendiente |
| [0009](./0009-pinear-typescript-y-vite.md) | Fijar TypeScript en 6.0.3 y Vite en 7.3.6                                           | ✅ Aceptado  |
| [0010](./0010-import-x-no-cycle.md)        | Detectar dependencias circulares con `import-x/no-cycle` en vez de madge            | ✅ Aceptado  |

**Estados posibles:** `Propuesto` · `Aceptado` · `Reemplazado por ADR-NNNN` · `Obsoleto`

## Cómo escribir uno

1. Copiar [`TEMPLATE.md`](./TEMPLATE.md) a `NNNN-titulo-en-kebab-case.md`.
2. Numerar secuencialmente. Los números no se reciclan.
3. Escribirlo en el **mismo PR** que implementa la decisión.
4. Agregarlo a la tabla de arriba.

## Cuándo escribir uno

Escribí un ADR cuando la decisión:

- Es difícil de revertir más adelante (elección de framework, modelo de procesos, formato de persistencia)
- Tuvo alternativas razonables que se descartaron por motivos que vas a olvidar en tres meses
- Alguien futuro (o vos mismo) podría cuestionar con un "¿por qué no usaste X?"

**No** escribas un ADR para decisiones triviales o fácilmente reversibles. Un registro inflado de decisiones obvias hace que nadie lea las importantes.
