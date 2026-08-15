# 03 — Requerimientos funcionales

[← Arquitectura](./02-arquitectura.md) · [Índice](./README.md) · [Siguiente: Requerimientos no funcionales →](./04-requerimientos-no-funcionales.md)

**Prioridad (MoSCoW):** `M` = Must have (v1.0) · `S` = Should have · `C` = Could have · `W` = Won't have (esta versión)

Los IDs son estables y no se reciclan. Si un requerimiento se elimina, su ID queda retirado.

---

## Índice de módulos

| Rango  | Módulo                                                               |
| ------ | -------------------------------------------------------------------- |
| RF-0xx | [Gestión de workspace y archivos](#gestión-de-workspace-y-archivos)  |
| RF-1xx | [Editor](#editor)                                                    |
| RF-2xx | [Búsqueda en workspace](#búsqueda-en-workspace)                      |
| RF-3xx | [Terminal integrada](#terminal-integrada)                            |
| RF-4xx | [Language Server Protocol](#language-server-protocol-lsp)            |
| RF-5xx | [Debug Adapter Protocol](#debug-adapter-protocol-dap)                |
| RF-6xx | [Control de versiones (Git)](#control-de-versiones-git)              |
| RF-7xx | [Comandos, atajos y configuración](#comandos-atajos-y-configuración) |
| RF-8xx | [Temas y apariencia](#temas-y-apariencia)                            |
| RF-9xx | [Sistema de extensiones](#sistema-de-extensiones)                    |

---

## Gestión de workspace y archivos

| ID     | Prioridad | Requerimiento                                    | Criterio de aceptación                                                                                                                                                            |
| ------ | --------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RF-001 | M         | Abrir una carpeta como workspace                 | Dado un diálogo de selección de carpeta, cuando el usuario elige `/proyecto`, entonces el árbol de archivos muestra su contenido en < 500ms para carpetas de hasta 5.000 archivos |
| RF-002 | M         | Mostrar árbol de archivos jerárquico             | Carpetas colapsables, íconos por tipo de archivo, ordenado carpetas-primero alfabéticamente                                                                                       |
| RF-003 | M         | Crear, renombrar y eliminar archivos y carpetas  | Eliminar mueve a papelera del SO, no borra permanentemente. Renombrar a un nombre existente muestra error sin perder datos                                                        |
| RF-004 | M         | Detectar cambios externos en archivos            | Si un archivo abierto cambia en disco y no tiene ediciones sin guardar, se recarga automáticamente. Si tiene ediciones, se muestra un diálogo de conflicto                        |
| RF-005 | M         | Excluir carpetas del árbol y la búsqueda         | `node_modules`, `.git`, `dist` excluidos por defecto; configurable vía `files.exclude`                                                                                            |
| RF-006 | S         | Drag & drop para mover archivos dentro del árbol | —                                                                                                                                                                                 |
| RF-007 | C         | Múltiples carpetas raíz en un workspace          | —                                                                                                                                                                                 |

## Editor

| ID     | Prioridad | Requerimiento                                  | Criterio de aceptación                                                                               |
| ------ | --------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| RF-101 | M         | Editar texto con resaltado de sintaxis         | Soporte para al menos 15 lenguajes vía TextMate grammars                                             |
| RF-102 | M         | Múltiples archivos abiertos en pestañas        | El estado (cursor, scroll, undo stack) se preserva al cambiar de pestaña                             |
| RF-103 | M         | Multi-cursor                                   | `Alt+Click` agrega cursor; `Ctrl+D` selecciona siguiente ocurrencia; `Ctrl+Shift+L` selecciona todas |
| RF-104 | M         | Indicador de cambios sin guardar               | Punto en la pestaña; `Ctrl+S` guarda; cerrar con cambios pide confirmación                           |
| RF-105 | M         | Buscar y reemplazar en el archivo activo       | Con soporte de regex, case-sensitive y whole-word                                                    |
| RF-106 | M         | Deshacer/rehacer por archivo                   | Historial independiente por archivo, preservado mientras la pestaña esté abierta                     |
| RF-107 | S         | Split view horizontal y vertical               | Hasta 3 grupos de editores                                                                           |
| RF-108 | S         | Minimapa                                       | Toggleable vía settings                                                                              |
| RF-109 | S         | Code folding                                   | Por indentación y por sintaxis del lenguaje                                                          |
| RF-110 | S         | Breadcrumbs de navegación de símbolos          | Requiere LSP activo                                                                                  |
| RF-111 | C         | Modo Zen / pantalla completa sin distracciones | —                                                                                                    |
| RF-112 | W         | Edición colaborativa en tiempo real            | —                                                                                                    |

> **Nota de implementación (RF-102):** Monaco no soporta bien "un editor por pestaña con estado independiente" sin cuidado. Se debe implementar un `EditorModelRegistry` que reutilice modelos. Ver [ADR-0002](./adr/0002-monaco-editor.md).

## Búsqueda en workspace

| ID     | Prioridad | Requerimiento                                          | Criterio de aceptación                                                                                |
| ------ | --------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| RF-201 | M         | Buscar texto en todos los archivos del workspace       | Resultados de los primeros 100 matches en < 1s sobre un repo de 50.000 archivos                       |
| RF-202 | M         | Resultados agrupados por archivo, con línea y contexto | Click en un resultado abre el archivo en esa línea                                                    |
| RF-203 | M         | Filtros de include/exclude por glob                    | `src/**/*.ts` funciona como patrón de inclusión                                                       |
| RF-204 | S         | Reemplazar en todos los archivos                       | Con preview obligatorio antes de aplicar. Operación atómica: o se aplican todos los cambios o ninguno |
| RF-205 | S         | Búsqueda rápida de archivos por nombre (`Ctrl+P`)      | Matching fuzzy, primeros resultados en < 50ms                                                         |

## Terminal integrada

| ID     | Prioridad | Requerimiento                               | Criterio de aceptación                                                                    |
| ------ | --------- | ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| RF-301 | M         | Terminal con el shell por defecto del SO    | PowerShell en Windows, `$SHELL` en Unix. CWD inicial = raíz del workspace                 |
| RF-302 | M         | Múltiples instancias de terminal            | Cada una en su proceso, listadas en un dropdown                                           |
| RF-303 | M         | Redimensionar correctamente                 | El PTY recibe el evento `resize` con filas/columnas correctas                             |
| RF-304 | M         | Copiar y pegar                              | `Ctrl+Shift+C` / `Ctrl+Shift+V` en Windows/Linux                                          |
| RF-305 | M         | Matar procesos al cerrar                    | Cerrar la app termina todos los procesos hijo. Cero procesos huérfanos verificado en test |
| RF-306 | S         | Links clickeables (rutas de archivo y URLs) | Click en `src/index.ts:12:5` abre el archivo en esa posición                              |
| RF-307 | C         | Perfiles de terminal configurables          | —                                                                                         |

## Language Server Protocol (LSP)

| ID     | Prioridad | Requerimiento                                | Criterio de aceptación                                                                                              |
| ------ | --------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| RF-401 | M         | Lanzar y supervisar servidores LSP           | Al abrir un `.ts`, se lanza `typescript-language-server`. Si crashea, se reinicia hasta 3 veces y luego se notifica |
| RF-402 | M         | Autocompletado                               | Popup en < 200ms tras tipear, con documentación del símbolo                                                         |
| RF-403 | M         | Diagnósticos (errores y warnings)            | Subrayado ondulado en el editor + panel de problemas                                                                |
| RF-404 | M         | Hover con información de tipo                | —                                                                                                                   |
| RF-405 | M         | Ir a definición (`F12`)                      | Abre el archivo destino y posiciona el cursor                                                                       |
| RF-406 | S         | Buscar todas las referencias (`Shift+F12`)   | Panel lateral con resultados agrupados                                                                              |
| RF-407 | S         | Renombrar símbolo (`F2`)                     | Preview de todos los archivos afectados antes de aplicar                                                            |
| RF-408 | S         | Formatear documento                          | Vía LSP; con opción `editor.formatOnSave`                                                                           |
| RF-409 | S         | Code actions / quick fixes                   | Bombillita en el margen                                                                                             |
| RF-410 | M         | Soporte inicial: TypeScript/JS, Python, Rust | Los 3 configurados y probados                                                                                       |

## Debug Adapter Protocol (DAP)

| ID     | Prioridad | Requerimiento                            | Criterio de aceptación                                       |
| ------ | --------- | ---------------------------------------- | ------------------------------------------------------------ |
| RF-501 | M         | Configuración de debug vía `launch.json` | Schema validado, con autocompletado en el propio editor      |
| RF-502 | M         | Breakpoints                              | Click en el gutter agrega/quita; se persisten entre sesiones |
| RF-503 | M         | Controles de ejecución                   | Continue, Step Over, Step Into, Step Out, Restart, Stop      |
| RF-504 | M         | Panel de variables y call stack          | Objetos expandibles, scopes separados                        |
| RF-505 | M         | Consola de debug                         | Con evaluación de expresiones en el contexto actual          |
| RF-506 | S         | Breakpoints condicionales y logpoints    | —                                                            |
| RF-507 | S         | Watch expressions                        | —                                                            |
| RF-508 | M         | Soporte inicial: Node.js                 | `vscode-js-debug` integrado                                  |

## Control de versiones (Git)

| ID     | Prioridad | Requerimiento                                    | Criterio de aceptación                                           |
| ------ | --------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| RF-601 | M         | Detectar repositorio Git en el workspace         | Panel de Git aparece sólo si existe `.git`                       |
| RF-602 | M         | Ver archivos modificados, staged y untracked     | Agrupados, con indicadores de estado                             |
| RF-603 | M         | Stage / unstage de archivos individuales o todos | —                                                                |
| RF-604 | M         | Commit con mensaje                               | Valida mensaje no vacío; muestra error de Git si falla           |
| RF-605 | M         | Indicadores de cambio en el gutter del editor    | Verde=agregado, azul=modificado, rojo=eliminado                  |
| RF-606 | M         | Ver branch actual y cambiar de branch            | Dropdown en la status bar. Advierte si hay cambios sin commitear |
| RF-607 | S         | Diff view lado a lado                            | Para archivos modificados                                        |
| RF-608 | S         | Pull, push y fetch                               | Con feedback de progreso y manejo de errores de autenticación    |
| RF-609 | C         | Historial de commits del archivo                 | —                                                                |
| RF-610 | C         | Resolución de conflictos de merge en el editor   | —                                                                |

## Comandos, atajos y configuración

| ID     | Prioridad | Requerimiento                             | Criterio de aceptación                                                      |
| ------ | --------- | ----------------------------------------- | --------------------------------------------------------------------------- |
| RF-701 | M         | Paleta de comandos (`Ctrl+Shift+P`)       | Búsqueda fuzzy de todos los comandos registrados; muestra el atajo asociado |
| RF-702 | M         | Sistema de keybindings configurable       | Archivo `keybindings.json` editable; detecta y reporta conflictos           |
| RF-703 | M         | Keybindings contextuales (`when` clauses) | `"when": "editorFocus && !terminalFocus"` funciona correctamente            |
| RF-704 | M         | Settings en JSON con schema y validación  | Autocompletado y validación al editar `settings.json` dentro del propio IDE |
| RF-705 | M         | Settings de usuario y de workspace        | Los de workspace (`.pastecode/settings.json`) tienen precedencia            |
| RF-706 | S         | UI de settings gráfica                    | Además del JSON                                                             |
| RF-707 | M         | Persistir estado de sesión                | Al reabrir: mismas pestañas, mismo scroll, mismo workspace                  |

> Los contratos de `Command`, `Settings` y `WorkspaceState` están en [Modelo de datos](./05-modelo-de-datos.md).

## Temas y apariencia

| ID     | Prioridad | Requerimiento                                    | Criterio de aceptación                            |
| ------ | --------- | ------------------------------------------------ | ------------------------------------------------- |
| RF-801 | M         | Tema claro y tema oscuro incluidos               | Cambio en caliente sin reiniciar                  |
| RF-802 | M         | Seguir el tema del sistema operativo             | Opción `window.theme: "system"`                   |
| RF-803 | M         | Temas distribuibles como extensión               | La extensión de ejemplo `theme-nord` lo demuestra |
| RF-804 | S         | Configurar familia y tamaño de fuente del editor | Con soporte de ligaduras tipográficas             |
| RF-805 | C         | Personalizar colores individuales de la UI       | —                                                 |

## Sistema de extensiones

| ID     | Prioridad | Requerimiento                                   | Criterio de aceptación                                                    |
| ------ | --------- | ----------------------------------------------- | ------------------------------------------------------------------------- |
| RF-901 | M         | Cargar extensiones desde una carpeta local      | Escanea `~/.pastecode/extensions/` al arrancar                            |
| RF-902 | M         | Manifest de extensión (`package.json`) validado | Manifest inválido → extensión no carga + error visible, sin tumbar la app |
| RF-903 | M         | API: registrar comandos                         | `pastecode.commands.registerCommand(id, handler)`                         |
| RF-904 | M         | API: contribuir ítems a la status bar           | `pastecode.window.createStatusBarItem()`                                  |
| RF-905 | M         | API: leer y modificar el documento activo       | `pastecode.window.activeTextEditor.edit()`                                |
| RF-906 | M         | API: contribuir temas                           | Vía el campo `contributes.themes` del manifest                            |
| RF-907 | M         | Aislamiento de fallas                           | Extensión que crashea → host se reinicia en < 2s, IDE sigue funcionando   |
| RF-908 | M         | Activation events                               | `onLanguage:python`, `onCommand:x`, `onStartupFinished`                   |
| RF-909 | M         | Dos extensiones de ejemplo documentadas         | `theme-nord` y `word-count`, con README propio                            |
| RF-910 | S         | Habilitar/deshabilitar extensiones desde la UI  | —                                                                         |
| RF-911 | W         | Marketplace / instalación remota                | —                                                                         |

---

[← Arquitectura](./02-arquitectura.md) · [Índice](./README.md) · [Siguiente: Requerimientos no funcionales →](./04-requerimientos-no-funcionales.md)
