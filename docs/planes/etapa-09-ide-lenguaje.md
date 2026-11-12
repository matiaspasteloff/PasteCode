# Etapa 9 — IDE I: lenguaje y búsqueda

[← Etapa 8](./etapa-08-emulador-pantalla.md) · [Planes de ejecución](./README.md) · [Siguiente: IDE II →](./etapa-10-ide-git-debug-ia.md)

**Rama:** `claude/ide-exponential-improvements-mh7gtv-e9` · **PR contra:** `claude/ide-exponential-improvements-mh7gtv-e8`

## Objetivo

Los requerimientos `S` que quedaron sin hacer alrededor del código: lo que falta del LSP (RF-406 a RF-409), reemplazar en todos los archivos (RF-204) y los links de la terminal (RF-306). De paso se activa `editor.formatOnSave`, la última setting que el schema acepta sin efecto.

## Leer antes

- [ADR-0017](../adr/0017-cliente-lsp-con-vscode-jsonrpc.md) y [ADR-0018](../adr/0018-sincronizacion-incremental-de-documentos.md).
- `main/lsp/` entero: `client.ts`, `requests.ts`, `translate.ts`, `capabilities.ts`, `registry.ts`. Y `main/ipc/lsp.ts`.
- `renderer/features/lsp/providers.ts` y `renderer/features/editor/navigation.ts`.
- `packages/core/src/lsp/positions.ts`.
- `renderer/stores/ai-edits.ts`: los checkpoints del asistente. Esta etapa los reusa.
- `packages/core/src/search/ripgrep.ts` y `renderer/features/search/`.

## El molde de toda feature de LSP

Agregar Python y Rust fueron dos filas en una tabla y cero código. Las features nuevas tienen que conservar eso: **nada específico de un lenguaje**. Cada una son las mismas seis piezas:

1. La capability del cliente en `capabilities.ts`.
2. La request en `requests.ts`.
3. La traducción de la respuesta del protocolo a la forma del contrato, en `translate.ts`. Pura, con test.
4. El schema en `packages/ipc-contract/src/schemas/lsp.ts` y el canal en `channels.ts`.
5. El handler en `main/ipc/lsp.ts`.
6. El proveedor de Monaco en `providers.ts`, registrado **sólo si el servidor anuncia la capability**.

Los tipos del protocolo salen de `vscode-languageserver-protocol`. Verificá ahí cada nombre de método y cada forma: es la regla 7.

---

## Parte A — LSP

### T1 — Aplicar ediciones, que es lo que comparten tres features

Renombrar, formatear y las code actions terminan todas en lo mismo: una lista de ediciones de texto, a veces sobre varios archivos.

- **`packages/core`**: `applyTextEdits(texto, ediciones)`, pura. Las posiciones de LSP cuentan en unidades UTF-16 y `positions.ts` ya sabe convertirlas. Tests: ediciones múltiples en una línea, ediciones que se tocan, CRLF, caracteres fuera del plano básico, y ediciones superpuestas —que se rechazan—.
- **Sobre un archivo abierto**, se aplican como una edición del modelo de Monaco, para que se puedan deshacer.
- **Sobre un archivo que no está abierto**, el renderer lo lee con `fs:readFile`, aplica y escribe con `fs:writeFile`. Ninguna escritura sale del camino `fs:*`: es la misma frontera que respeta el asistente.
- **Varios archivos**: primero se calculan todos los contenidos nuevos, y si uno solo falla —no se puede leer, cambió en disco—, no se escribe ninguno. Después se escriben. Si una escritura falla a mitad de camino, se revierten las ya hechas con el contenido anterior que se tiene en memoria, y se avisa cuáles.
- El contenido anterior se guarda como **checkpoint**, con el mecanismo de `ai-edits.ts`: una notificación con _Deshacer_ después de cada edición multiarchivo.

### T2 — Formatear (RF-408), y `formatOnSave`

- `textDocument/formatting`, con el proveedor de formato de documento de Monaco. Comando `editor.formatDocument`, con su atajo.
- **`editor.formatOnSave`** entra en el flujo de guardado: formatear, después recortar espacios (etapa 4), después escribir.
- **Con tiempo límite.** Si el servidor no contesta en un par de segundos, se guarda sin formatear y se avisa. Guardar no puede quedar rehén de un servidor de lenguaje (RNF-07).
- El auto-guardado de la etapa 4 **no** formatea: formatear mientras alguien escribe le mueve el código de lugar.

### T3 — Ayuda de firma y símbolos del documento

- `textDocument/signatureHelp`, con su proveedor.
- `textDocument/documentSymbol`, con su proveedor. Además de habilitar el esquema del archivo, es lo que le faltaba a las migas de pan: conectalo al componente de la etapa 6 y cerrá RF-110.

### T4 — Referencias (RF-406)

`textDocument/references`.

El requerimiento pide _"panel con resultados agrupados"_. Eso es más simple y más robusto que la vista flotante de Monaco, que necesita un modelo cargado por cada archivo referenciado. Va como **pestaña nueva del panel inferior**: una entrada en `PANEL_VIEW_REGISTRY`, con los resultados agrupados por archivo —reusá `search-rows.ts` y el componente de resultados de búsqueda, que ya agrupan así—. Click en una fila abre el archivo en esa posición con `navigation.ts`.

`shift+f12`, cuando hay un servidor con esa capability.

### T5 — Renombrar símbolo (RF-407)

- `textDocument/prepareRename` para validar la posición y proponer el nombre actual, y `textDocument/rename`.
- **Vista previa obligatoria antes de aplicar**: es el criterio de aceptación. Un diálogo con los archivos afectados y cuántos cambios lleva cada uno.
- Se aplica con T1.
- **Archivos con cambios sin guardar entre los afectados**: sus ediciones van al modelo abierto, no al disco. Nunca se pisa trabajo sin guardar.

### T6 — Code actions (RF-409)

- `textDocument/codeAction`, con el proveedor de Monaco, que ya dibuja la bombilla.
- Una acción puede traer una edición —se aplica con T1— o un comando.
- **Los comandos**: `workspace/executeCommand`. El servidor suele responder pidiéndole al cliente que aplique una edición, con `workspace/applyEdit`, que es una **request del servidor al cliente**. Verificá en `client.ts` si el cliente contesta requests entrantes; si no, eso hay que agregarlo primero.
- Alcance: los arreglos rápidos que traen su edición andan completos. Los que dependen de un comando, si `workspace/applyEdit` entra. Lo que no entre se anota.

### Tests de la parte A

- `core`: `applyTextEdits`.
- main: las traducciones, y las requests contra `main/supervisors/fake-server.mjs`, ampliado para responder los métodos nuevos.
- E2E `lsp-features.spec.ts`, con el servidor de TypeScript de verdad —`e2e/perf/lsp-latency.perf.ts` ya lo levanta, mirá cómo—: formatear un archivo, renombrar un símbolo usado en dos archivos, y buscar referencias.

**RF-402 pide el completado en menos de 200ms.** Ningún proveedor nuevo puede correr en el camino de una tecla.

---

## Parte B — Reemplazar en archivos (RF-204)

El criterio de aceptación tiene dos mitades: **vista previa obligatoria** y **todo o nada**.

### T7 — Planear el reemplazo

**El problema de las dos expresiones regulares.** La búsqueda la hace ripgrep, con el motor de Rust. Si el reemplazo se calcula con el de JavaScript, lo que se previsualiza puede no ser lo que ripgrep encontró: los dos motores no aceptan exactamente lo mismo.

La regla que lo resuelve: **lo que se muestra es lo que se aplica, porque sale de la misma función.** ripgrep se usa sólo para saber _en qué archivos_ mirar. Las coincidencias y sus reemplazos los calcula una función pura sobre el contenido de cada archivo.

- `packages/core`: dado un texto, la consulta y el reemplazo, devuelve las ediciones y el texto nuevo. Tests: literal, expresión con grupos de captura, sin distinguir mayúsculas, palabra entera, CRLF, y la coincidencia vacía —que no puede colgar el bucle—.
- Una expresión que ripgrep acepta y JavaScript no, **se rechaza con un mensaje claro** antes de tocar nada. No se intenta traducir.

### T8 — Previsualizar y aplicar

- En el panel de búsqueda: el campo de reemplazo y _Reemplazar todo_, que abre la vista previa con el antes y el después de cada línea. Nada se escribe hasta confirmar ahí.
- **Si algún archivo afectado está abierto con cambios sin guardar, no se corre.** Se dice cuáles son y que hay que guardarlos o descartarlos. Es la opción aburrida y es la que no pierde datos.
- Aplicar es T1 con muchos archivos: leer todo, verificar que nada cambió desde la vista previa, calcular, escribir, y revertir si algo falla.
- Un tope de archivos y de tamaño total, con progreso y la posibilidad de cancelar (RNF-24).
- Al terminar, una notificación con _Deshacer_.

Todo desde el renderer, por los canales `fs:*` que ya existen. El main no cambia.

---

## Parte C — Links en la terminal (RF-306)

### T9

- `packages/core/src/terminal/links.ts`, puro y con tests: encontrar en una línea las rutas con posición —`src/index.ts:12:5`, la forma con paréntesis que usan algunos compiladores, las de un stack trace— y las URL `https`.
- Un proveedor de links de xterm. Verificá en los tipos de `@xterm/xterm` cómo se registra.
- **Una ruta** se resuelve contra la raíz del workspace y se abre en esa posición con el flujo normal del editor, que ya valida. Si no existe, no pasa nada.
- **Una URL** se abre por el camino que ya existe: la guarda de `webContents` de la etapa 1 la manda al navegador del sistema sólo si es `https`.

El plan general listó `@xterm/addon-web-links` como dependencia posible. **Si un solo proveedor propio cubre rutas y URL, no hace falta agregarla.** Preferí eso.

---

## T10 — Documentación

- `docs/03-requerimientos-funcionales.md`: RF-110, RF-204, RF-306 y RF-406 a RF-409, cada uno con lo entregado.
- `docs/02-arquitectura.md`: el molde de seis piezas de una feature de LSP, y la regla de que las ediciones multiarchivo pasan por `fs:*` desde el renderer.
- `docs/05-modelo-de-datos.md`: `editor.formatOnSave` deja de decir "sin efecto".
- `CHANGELOG.md` y `PROGRESO.md`.

---

## Criterios de aceptación

1. Los cuatro comandos de verificación pasan, y el CI del PR está en verde, incluidos los presupuestos de RF-401 y RF-402.
2. Ningún código nuevo nombra un lenguaje: todo sale de las capabilities que anuncia el servidor.
3. Renombrar y reemplazar en archivos muestran una vista previa y no escriben nada antes de confirmar.
4. Una edición multiarchivo que falla a mitad de camino deja el disco como estaba. Hay test.
5. Ninguna de estas operaciones pisa un archivo con cambios sin guardar. Hay test.
6. `editor.formatOnSave` funciona, y guardar nunca queda esperando a un servidor.
7. `lsp-features.spec.ts` pasa contra el servidor de TypeScript real.

## Trampas

- **Las posiciones.** LSP cuenta en UTF-16 y arranca en cero; Monaco arranca en uno. `positions.ts` existe para no equivocarse dos veces.
- **Las rutas.** Monaco devuelve la unidad en minúscula. Agrupar referencias por archivo con `===` duplica grupos: `same-path.ts`.
- **`noteOwnWrite`.** Lo que el renderer escribe por `fs:writeFile` no dispara el aviso de cambio externo. Después de una edición multiarchivo, las pestañas abiertas de esos archivos tienen que adoptar el contenido nuevo. El asistente ya resuelve este mismo problema: mirá cómo.
- **El servidor de TypeScript del workspace.** Desde la etapa 3, en modo restringido no hay servidores. Todas estas features tienen que degradar en silencio cuando no hay cliente.
- **`fake-server.mjs` lo usan otros tests.** Ampliarlo no puede cambiar lo que ya responde.
