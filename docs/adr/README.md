# Architecture Decision Records

[← Índice de documentación](../README.md)

Un ADR registra una decisión técnica relevante, el contexto en el que se tomó, las alternativas que se descartaron y las consecuencias que trae. No se editan una vez aceptados: si una decisión cambia, se escribe un ADR nuevo que reemplaza al anterior.

**Por qué importan acá:** para un proyecto de portfolio, los ADRs son a menudo lo más valioso del repo. Muestran cómo pensás, no sólo qué escribís.

## Registro

| #                                                              | Título                                                                         | Estado       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------ |
| [0001](./0001-electron-typescript.md)                          | Usar Electron + TypeScript como runtime de escritorio                          | ✅ Aceptado  |
| [0002](./0002-monaco-editor.md)                                | Usar Monaco Editor como núcleo de edición                                      | ✅ Aceptado  |
| [0003](./0003-extension-host-aislado.md)                       | Extension host en un proceso separado                                          | ✅ Aceptado  |
| [0004](./0004-zustand-para-el-estado-del-renderer.md)          | Usar Zustand con stores chicos por dominio para el estado del renderer         | ✅ Aceptado  |
| [0005](./0005-settings-en-json-con-schema-zod.md)              | Settings en JSON validado con Zod, en dos capas                                | ✅ Aceptado  |
| [0006](./0006-electron-vite-como-build.md)                     | Usar electron-vite como herramienta de build                                   | ✅ Aceptado  |
| [0007](./0007-ripgrep-como-binario-externo.md)                 | Buscar en el workspace con ripgrep como binario externo                        | ✅ Aceptado  |
| 0008                                                           | Mecanismo de auto-update (electron-updater + GitHub Releases)                  | ⏳ Pendiente |
| [0009](./0009-pinear-typescript-y-vite.md)                     | Fijar TypeScript en 6.0.3 y Vite en 7.3.6                                      | ✅ Aceptado  |
| [0010](./0010-import-x-no-cycle.md)                            | Detectar dependencias circulares con `import-x/no-cycle` en vez de madge       | ✅ Aceptado  |
| [0011](./0011-resultado-tipado-en-el-limite-de-ipc.md)         | Devolver un resultado tipado y errores serializados en el límite de IPC        | ✅ Aceptado  |
| [0012](./0012-servir-el-renderer-desde-un-protocolo-propio.md) | Servir el renderer desde un protocolo propio en vez de `file://`               | ✅ Aceptado  |
| [0013](./0013-eventos-tipados-en-el-ipc.md)                    | Eventos tipados del main al renderer, sobre `ipcRenderer.on`                   | ✅ Aceptado  |
| [0014](./0014-node-pty-con-binarios-precompilados.md)          | `@lydell/node-pty` con prebuilds por plataforma, en vez del `node-pty` oficial | ✅ Aceptado  |

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
