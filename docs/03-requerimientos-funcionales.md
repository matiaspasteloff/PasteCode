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

| ID        | Prioridad | Requerimiento                                    | Criterio de aceptación                                                                                                                                                                                                                       |
| --------- | --------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RF-001    | M         | Abrir una carpeta como workspace                 | Dado un diálogo de selección de carpeta, cuando el usuario elige `/proyecto`, entonces el árbol de archivos muestra su contenido en < 500ms para carpetas de hasta 5.000 archivos                                                            |
| RF-002    | M         | Mostrar árbol de archivos jerárquico             | Carpetas colapsables, íconos por tipo de archivo, ordenado carpetas-primero alfabéticamente                                                                                                                                                  |
| RF-003    | M         | Crear, renombrar y eliminar archivos y carpetas  | Eliminar mueve a papelera del SO, no borra permanentemente. Renombrar a un nombre existente muestra error sin perder datos                                                                                                                   |
| RF-004 ✅ | M         | Detectar cambios externos en archivos            | Si un archivo abierto cambia en disco y no tiene ediciones sin guardar, se recarga automáticamente. Si tiene ediciones, se muestra un diálogo de conflicto. **Cerrado en la Etapa 4** ([ADR-0020](./adr/0020-watcher-unico-con-chokidar.md)) |
| RF-005    | M         | Excluir carpetas del árbol y la búsqueda         | `node_modules`, `.git`, `dist` excluidos por defecto; configurable vía `files.exclude`                                                                                                                                                       |
| RF-006    | S         | Drag & drop para mover archivos dentro del árbol | —                                                                                                                                                                                                                                            |
| RF-007    | C         | Múltiples carpetas raíz en un workspace          | —                                                                                                                                                                                                                                            |

## Editor

| ID     | Prioridad | Requerimiento                                  | Criterio de aceptación                                                                                                                                                                                                                                                                                                  |
| ------ | --------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RF-101 | M         | Editar texto con resaltado de sintaxis         | Soporte para al menos 15 lenguajes vía las gramáticas incluidas en Monaco                                                                                                                                                                                                                                               |
| RF-102 | M         | Múltiples archivos abiertos en pestañas        | El estado (cursor, scroll, undo stack) se preserva al cambiar de pestaña                                                                                                                                                                                                                                                |
| RF-103 | M         | Multi-cursor                                   | `Alt+Click` agrega cursor; `Ctrl+D` selecciona siguiente ocurrencia; `Ctrl+Shift+L` selecciona todas                                                                                                                                                                                                                    |
| RF-104 | M         | Indicador de cambios sin guardar               | Punto en la pestaña; `Ctrl+S` guarda; cerrar con cambios pide confirmación                                                                                                                                                                                                                                              |
| RF-105 | M         | Buscar y reemplazar en el archivo activo       | Con soporte de regex, case-sensitive y whole-word                                                                                                                                                                                                                                                                       |
| RF-106 | M         | Deshacer/rehacer por archivo                   | Historial independiente por archivo, preservado mientras la pestaña esté abierta                                                                                                                                                                                                                                        |
| RF-107 | S         | Split view horizontal y vertical               | Hasta 3 grupos de editores. **Alcance, Etapa 4: se entrega con 2.** El módulo puro está escrito para N y `MAX_GROUPS` es la única constante que hay que subir; lo que falta es UI —el layout deja de ser una fila y pasa a ser un árbol de divisiones— ([ADR-0023](./adr/0023-dos-grupos-sobre-modelos-compartidos.md)) |
| RF-108 | S         | Minimapa                                       | Toggleable vía settings                                                                                                                                                                                                                                                                                                 |
| RF-109 | S         | Code folding                                   | Por indentación y por sintaxis del lenguaje                                                                                                                                                                                                                                                                             |
| RF-110 | S         | Breadcrumbs de navegación de símbolos          | Requiere LSP activo                                                                                                                                                                                                                                                                                                     |
| RF-111 | C         | Modo Zen / pantalla completa sin distracciones | —                                                                                                                                                                                                                                                                                                                       |
| RF-112 | W         | Edición colaborativa en tiempo real            | —                                                                                                                                                                                                                                                                                                                       |
| RF-113 | S         | Resaltado vía TextMate grammars                | Habilita que las extensiones de tema aporten reglas de tokenización. Requiere aceptar `wasm-unsafe-eval` y enmendar RNF-13 con un ADR. Etapa 5                                                                                                                                                                          |

> **Nota de corrección (RF-101), Etapa 2.** La redacción original pedía _"vía TextMate grammars"_. Monaco no usa TextMate: usa **Monarch**, su propio formato, y trae 81 gramáticas incluidas. Soportar TextMate de verdad requiere `vscode-textmate` + `vscode-oniguruma`, que son **WASM**, y eso obliga a agregar `wasm-unsafe-eval` a `script-src`, contra [RNF-13](./04-requerimientos-no-funcionales.md#seguridad). Se corrigió el criterio de aceptación a las gramáticas de Monaco, que cumplen el espíritu del requerimiento —muy por encima de 15 lenguajes resaltados— sin dependencias nuevas ni excepciones de CSP. TextMate vuelve como [RF-113](#editor), en la Etapa 5, que es donde de verdad hace falta: sin él, una extensión de tema como `theme-nord` no puede aportar reglas de tokenización.

> **Nota de implementación (RF-102):** Monaco no soporta bien "un editor por pestaña con estado independiente" sin cuidado. Se debe implementar un `EditorModelRegistry` que reutilice modelos. Ver [ADR-0002](./adr/0002-monaco-editor.md).

> **Nota de verificación (RF-103 y RF-105), Etapa 3.** Los dos son funcionalidad nativa de Monaco y no llevan código propio: `Alt+Click`, `Ctrl+D` y `Ctrl+Shift+L` para los cursores, `Ctrl+F` y `Ctrl+H` para buscar y reemplazar en el archivo activo, con regex, mayúsculas y palabra entera. Lo que sí hacía falta verificar es que el resolver de keybindings de la aplicación **no les robe los atajos**, que es el riesgo que introdujo esta etapa al sumar `Ctrl+Shift+F` y `Ctrl+P` al mapa global. Lo cubre `e2e/tests/editing.spec.ts`.

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

| ID     | Prioridad | Requerimiento                                | Criterio de aceptación                                                                                                                                                                                                                                                                                                                                                                                             |
| ------ | --------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RF-401 | M         | Lanzar y supervisar servidores LSP           | Al abrir un `.ts`, se lanza `typescript-language-server`. Si crashea, se reinicia hasta 3 veces y luego se notifica. **Alcance:** los servidores son **perezosos** —se lanzan en el primer documento de su lenguaje, no al arrancar— y `tsserver` sale del `node_modules` del workspace; sin TypeScript instalado ahí, el servidor no arranca y lo dice ([ADR-0017](./adr/0017-cliente-lsp-con-vscode-jsonrpc.md)) |
| RF-402 | M         | Autocompletado                               | Popup en < 200ms tras tipear, con documentación del símbolo                                                                                                                                                                                                                                                                                                                                                        |
| RF-403 | M         | Diagnósticos (errores y warnings)            | Subrayado ondulado en el editor + panel de problemas                                                                                                                                                                                                                                                                                                                                                               |
| RF-404 | M         | Hover con información de tipo                | —                                                                                                                                                                                                                                                                                                                                                                                                                  |
| RF-405 | M         | Ir a definición (`F12`)                      | Abre el archivo destino y posiciona el cursor                                                                                                                                                                                                                                                                                                                                                                      |
| RF-406 | S         | Buscar todas las referencias (`Shift+F12`)   | Panel lateral con resultados agrupados                                                                                                                                                                                                                                                                                                                                                                             |
| RF-407 | S         | Renombrar símbolo (`F2`)                     | Preview de todos los archivos afectados antes de aplicar                                                                                                                                                                                                                                                                                                                                                           |
| RF-408 | S         | Formatear documento                          | Vía LSP; con opción `editor.formatOnSave`                                                                                                                                                                                                                                                                                                                                                                          |
| RF-409 | S         | Code actions / quick fixes                   | Bombillita en el margen                                                                                                                                                                                                                                                                                                                                                                                            |
| RF-410 | M         | Soporte inicial: TypeScript/JS, Python, Rust | Los 3 configurados y probados. **Alcance:** sólo el de TypeScript se empaqueta. `pyright` son ~50MB y `rust-analyzer` ~70MB contra los 22,3MB de margen de RNF-05, así que sus rutas salen de `lsp.serverPaths`; sin ellas el servidor queda `failed` con un mensaje accionable y el resto de la app sigue andando                                                                                                 |

## Debug Adapter Protocol (DAP)

| ID     | Prioridad | Requerimiento                            | Criterio de aceptación                                         |
| ------ | --------- | ---------------------------------------- | -------------------------------------------------------------- |
| RF-501 | M         | Configuración de debug vía `launch.json` | Schema validado, con autocompletado en el propio editor        |
| RF-502 | M         | Breakpoints                              | Click en el gutter agrega/quita; se persisten entre sesiones   |
| RF-503 | M         | Controles de ejecución                   | Continue, Step Over, Step Into, Step Out, Restart, Stop        |
| RF-504 | M         | Panel de variables y call stack          | Objetos expandibles, scopes separados                          |
| RF-505 | M         | Consola de debug                         | Con evaluación de expresiones en el contexto actual            |
| RF-506 | S         | Breakpoints condicionales y logpoints    | —                                                              |
| RF-507 | S         | Watch expressions                        | —                                                              |
| RF-508 | M         | Soporte inicial: Node.js                 | `vscode-js-debug` integrado. **Parcial**: ver la nota de abajo |

> **Nota de alcance (RF-508), Etapa 5.** El adaptador es **externo y configurado por ruta**, no empaquetado: `debug.adapterPath` en las settings del usuario, con la misma allow-list que `lsp.serverPaths`. Es la misma decisión que ya se tomó tres veces —`ripgrep`, `git`, los servidores de lenguaje— y por las mismas razones. Depurar Node funciona apuntando esa ruta a un adaptador instalado; lo que **no** se hizo es la parte de _integrado_. Ver [ADR-0028](./adr/0028-adaptador-dap-externo-y-cliente-propio.md).
>
> **Nota de alcance (RF-905), Etapa 5.** El evento de cambio de documento activo **no lleva el texto**: sólo `path`, `languageId` y `version`. Con [RNF-03](./04-requerimientos-no-funcionales.md) permitiendo archivos de 10MB, un push del contenido en cada tecla serían dos saltos de proceso con el archivo entero adentro. La extensión lo pide con `getText()` cuando lo necesita, y una edición se aplica contra la versión que leyó o devuelve `false`. Ver [ADR-0026](./adr/0026-broker-unico-y-pull-del-documento-activo.md).
>
> **Nota de alcance (RF-113), Etapa 5.** Sigue **diferido**. Los temas de extensión aportan reglas de tokenización en el vocabulario de **Monarch**, el formato propio de Monaco, que es lo que el editor entiende; TextMate de verdad sigue requiriendo WASM y una excepción a [RNF-13](./04-requerimientos-no-funcionales.md), y esta etapa no la tomó. `theme-nord` colorea sin él.

## Control de versiones (Git)

| ID     | Prioridad | Requerimiento                                    | Criterio de aceptación                                                                                                                                                                                                                                                                                                                                          |
| ------ | --------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RF-601 | M         | Detectar repositorio Git en el workspace         | Panel de Git aparece sólo si existe `.git`                                                                                                                                                                                                                                                                                                                      |
| RF-602 | M         | Ver archivos modificados, staged y untracked     | Agrupados, con indicadores de estado                                                                                                                                                                                                                                                                                                                            |
| RF-603 | M         | Stage / unstage de archivos individuales o todos | —                                                                                                                                                                                                                                                                                                                                                               |
| RF-604 | M         | Commit con mensaje                               | Valida mensaje no vacío; muestra error de Git si falla                                                                                                                                                                                                                                                                                                          |
| RF-605 | M         | Indicadores de cambio en el gutter del editor    | Verde=agregado, azul=modificado, rojo=eliminado. **Alcance:** las marcas se refrescan al guardar, con el watcher y después de stage/unstage, **nunca al tipear**: el diff cuesta un proceso y pedirlo por tecla rompe RNF-02. Salen de las cabeceras `@@` de `git diff -U0` y no de un algoritmo de diff propio ([ADR-0019](./adr/0019-git-con-spawn-crudo.md)) |
| RF-606 | M         | Ver branch actual y cambiar de branch            | Dropdown en la status bar. Advierte si hay cambios sin commitear                                                                                                                                                                                                                                                                                                |
| RF-607 | S         | Diff view lado a lado                            | Para archivos modificados                                                                                                                                                                                                                                                                                                                                       |
| RF-608 | S         | Pull, push y fetch                               | Con feedback de progreso y manejo de errores de autenticación                                                                                                                                                                                                                                                                                                   |
| RF-609 | C         | Historial de commits del archivo                 | —                                                                                                                                                                                                                                                                                                                                                               |
| RF-610 | C         | Resolución de conflictos de merge en el editor   | —                                                                                                                                                                                                                                                                                                                                                               |

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

| ID     | Prioridad | Requerimiento                                    | Criterio de aceptación                                                                                                                                                                                                                                              |
| ------ | --------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RF-801 | M         | Temas incluidos                                  | Claro, oscuro y los nueve incorporados de la etapa experimental (Dracula, One Dark, Tokyo Night, Gruvbox, Monokai, Solarized Light, Solarized Dark, Catppuccin Mocha y Alto Contraste). Cambio en caliente sin reiniciar, con preview en vivo desde `Ctrl+K Ctrl+T` |
| RF-802 | M         | Seguir el tema del sistema operativo             | Opción `window.theme: "system"`                                                                                                                                                                                                                                     |
| RF-803 | M         | Temas distribuibles como extensión               | La extensión de ejemplo `theme-nord` lo demuestra. Los incorporados de RF-801 usan **el mismo camino de aplicación** y no un mecanismo aparte: son datos en `packages/core`, no extensiones empaquetadas ([ADR-0031](./adr/0031-temas-incorporados-como-datos.md))  |
| RF-804 | S         | Configurar familia y tamaño de fuente del editor | Con soporte de ligaduras tipográficas                                                                                                                                                                                                                               |
| RF-805 | C         | Personalizar colores individuales de la UI       | —                                                                                                                                                                                                                                                                   |

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

## Asistente de IA (etapa experimental)

> **Este módulo no cuenta contra el contrato de alcance de la v1.** Vive en [Alcance experimental](./01-vision-y-alcance.md#alcance-experimental): es opt-in, no cambia nada si no se configura, y se puede sacar sin romper el resto. La decisión está en [ADR-0029](./adr/0029-asistente-de-ia-en-el-main.md).

| ID      | Prioridad | Requerimiento                               | Criterio de aceptación                                                                                                                                                                                                                                                                                        |
| ------- | --------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RF-1001 | M         | Chat con selección de modelo                | Vista lateral propia con historial de la conversación y un selector de modelo. El modelo elegido se recuerda mientras dure la sesión                                                                                                                                                                          |
| RF-1002 | M         | Sólo modelos gratuitos                      | La lista que se ofrece sale de `/api/v1/models` de OpenRouter filtrada a `pricing.prompt === '0' && pricing.completion === '0'`. Un modelo que no está en esa lista **no se puede elegir**: la etapa experimental no puede generar un cargo sin que nadie lo haya pedido                                      |
| RF-1003 | M         | Clave de API en almacenamiento cifrado      | Se guarda con `safeStorage` de Electron, en `userData/ai-credentials.bin`. **Nunca vuelve al renderer**: `ai:getKeyStatus` responde `{ hasKey: boolean }` y nada más. Si `isEncryptionAvailable()` da falso, la clave no se guarda y se avisa — no hay fallback a texto plano                                 |
| RF-1004 | M         | Respuesta en streaming, token a token       | La respuesta se pinta a medida que llega, por el evento `ai:delta`. Sale del `text/event-stream` de OpenRouter, parseado por un parser incremental propio en `packages/core`                                                                                                                                  |
| RF-1005 | M         | Herramientas de lectura del workspace       | `list_files`, `read_file` y `search_workspace`. Se resuelven **en el main**, reusando `resolveInsideWorkspace` y el servicio de búsqueda que ya existe: una ruta que el modelo invente fuera del workspace se rechaza igual que una que invente el renderer ([RNF-11](./04-requerimientos-no-funcionales.md)) |
| RF-1006 | M         | Edición con confirmación previa             | `write_file` y `create_file` **no tocan el disco en el main**. Emiten `ai:toolCall`, el renderer muestra el diff con `monaco.editor.createDiffEditor`, y recién con "Aplicar" se escribe por el canal `fs:*` de siempre. "Descartar" no escribe nada y se lo informa al modelo como resultado                 |
| RF-1007 | M         | Cancelación de la respuesta en curso        | `ai:cancel` aborta el `fetch` por su `AbortController`. La conversación conserva lo que ya se había pintado                                                                                                                                                                                                   |
| RF-1008 | S         | Acciones sobre un bloque de código          | Copiar, insertar en el cursor y reemplazar la selección, desde el bloque de código de la respuesta                                                                                                                                                                                                            |
| RF-1009 | C         | Persistir las conversaciones entre sesiones | —                                                                                                                                                                                                                                                                                                             |
| RF-1010 | W         | Autocompletado inline con LLM               | Fuera de alcance incluso acá. Ver [Alcance experimental](./01-vision-y-alcance.md#alcance-experimental)                                                                                                                                                                                                       |

> **Nota de seguridad (RF-1005/1006).** Lo que devuelve el modelo es **entrada no confiable**, exactamente igual que lo que manda el renderer. Los argumentos de cada herramienta se validan con su schema antes de tocar nada, y las rutas pasan por `resolveInsideWorkspace` sin excepción. La diferencia con el renderer es que acá el atacante puede ser el contenido de un archivo del propio workspace, así que la confirmación de RF-1006 no es cortesía de UX: es el único punto donde una persona ve qué se va a escribir antes de que se escriba.

---

---

[← Arquitectura](./02-arquitectura.md) · [Índice](./README.md) · [Siguiente: Requerimientos no funcionales →](./04-requerimientos-no-funcionales.md)
