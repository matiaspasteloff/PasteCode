# 07 — Glosario

[← Roadmap y riesgos](./06-roadmap-y-riesgos.md) · [Índice](./README.md)

---

| Término                 | Definición                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ADR**                 | Architecture Decision Record. Documento corto que registra una decisión técnica, su contexto y sus consecuencias. Ver [`adr/`](./adr/)                        |
| **Capability**          | Permiso que una extensión declara en su manifest. Sin declaración, sin acceso                                                                                 |
| **DAP**                 | Debug Adapter Protocol. Protocolo de Microsoft que estandariza la comunicación entre un IDE y un debugger                                                     |
| **Dogfooding**          | Usar el propio producto para desarrollarlo. Acá: editar el código de PasteCode con PasteCode                                                                  |
| **Extension host**      | Proceso aislado donde corren las extensiones de terceros                                                                                                      |
| **IPC**                 | Inter-Process Communication. En Electron, el mecanismo por el que renderer y main se comunican                                                                |
| **LSP**                 | Language Server Protocol. Protocolo que estandariza features de lenguaje (completado, diagnósticos, go-to-definition) entre editores y servidores de lenguaje |
| **Main process**        | Proceso principal de Electron. Corre en Node, tiene acceso al SO, gestiona ventanas                                                                           |
| **Monaco**              | Componente editor de código extraído de VS Code. Ver [ADR-0002](./adr/0002-monaco-editor.md)                                                                  |
| **MoSCoW**              | Esquema de priorización: Must / Should / Could / Won't have                                                                                                   |
| **Path traversal**      | Ataque que usa `../` para escapar de un directorio permitido. Ver [RNF-11](./04-requerimientos-no-funcionales.md#seguridad)                                   |
| **PTY**                 | Pseudo-terminal. Interfaz del SO que permite a un programa actuar como terminal para un shell                                                                 |
| **Renderer process**    | Proceso de Chromium que dibuja la UI. Sandboxeado, sin acceso al SO                                                                                           |
| **RF / RNF**            | Requerimiento Funcional / Requerimiento No Funcional                                                                                                          |
| **TextMate grammar**    | Formato de definición de resaltado de sintaxis, usado por VS Code y Monaco                                                                                    |
| **Time-to-interactive** | Tiempo desde el lanzamiento hasta que el usuario puede interactuar. Ver [RNF-01](./04-requerimientos-no-funcionales.md#performance)                           |
| **Workspace**           | Carpeta raíz abierta en el IDE, junto con su configuración y estado asociados                                                                                 |

---

[← Roadmap y riesgos](./06-roadmap-y-riesgos.md) · [Índice](./README.md)
