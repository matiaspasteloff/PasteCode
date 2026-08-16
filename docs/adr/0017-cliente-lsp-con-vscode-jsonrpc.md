# ADR-0017: Hablar LSP con `vscode-jsonrpc` y tipos de `vscode-languageserver-protocol`, sin `monaco-languageclient`

## Estado

`Aceptado`

**Fecha:** 2026-08-16

## Contexto

El [paso 28](../00-guia-paso-a-paso.md#etapa-4--inteligencia-de-lenguaje-y-git) pide integrar servidores de lenguaje: diagnósticos ([RF-401](../03-requerimientos-funcionales.md)), completado (RF-402), problemas (RF-403), hover (RF-404), ir a definición (RF-405) y, después, Python y Rust (RF-410).

Hablar LSP es hablar JSON-RPC 2.0 sobre stdio con un framing propio: cada mensaje va precedido de una cabecera `Content-Length: N\r\n\r\n`. Sobre eso hay un ciclo de vida —`initialize`, `initialized`, `shutdown`, `exit`—, negociación de capabilities, cancelación por `$/cancelRequest` y un puñado de notificaciones que el servidor empuja sin que nadie las pida.

Tres fuerzas concretas, y ninguna es "cuál librería es más linda":

1. **[RNF-05](../04-requerimientos-no-funcionales.md#recursos) pone el techo del instalador en 120MB y el build está en 97,7MB.** Quedan 22,3MB de margen para toda la Etapa 4, incluido lo de Git.
2. **El `stdout` de un servidor de lenguaje es contenido influenciado por el atacante.** Los hovers, los diagnósticos y los mensajes de error reflejan el contenido de archivos que pueden venir de un repositorio clonado. Un parser con prefijo de longitud que se desincroniza es un bug de seguridad, no una molestia.
3. **El proceso ya está resuelto.** [ADR-0016](./0016-supervisor-de-procesos-generico.md) dejó `SupervisedProcess` con reinicio, backoff, health check pasivo y —lo que importa acá— dos costuras escritas pensando en esto: `requestGracefulExit` para el `shutdown`/`exit` del protocolo y `onRestart` para rehacer el `initialize`. `ChildProcessHandle` ya expone `stdin` y `stdout` por separado, que es exactamente lo que un cliente JSON-RPC necesita.

## Decisión

**`vscode-jsonrpc` como runtime del transporte, `vscode-languageserver-protocol` como `import type` solamente, y el ciclo de vida del proceso sigue siendo de `SupervisedProcess`.**

```
apps/desktop/src/main/lsp/
  capabilities.ts          ← lo que declaramos saber hacer
  client.ts                ← handshake, single-flight, health check, apagado
  registry.ts              ← un cliente por serverId, perezosos
  documents.ts             ← qué está abierto y en qué versión
  diagnostics.ts           ← traducción y lotes de 30ms/50 documentos
  resolve-server-path.ts   ← de dónde sale el ejecutable
```

`vscode-languageserver-protocol` entra **sólo con `import type`**, así que se borra al compilar y no pesa nada en runtime. Las tablas de traducción de sus enums viven en `packages/core/src/lsp`, del lado puro y testeado.

## Alternativas consideradas

| Opción                      | Pros                                                                                                                                                 | Contras                                                                                                                                                                                                                           | Por qué no                                                                                                                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`monaco-languageclient`** | Conecta Monaco con un servidor LSP casi sin código propio: proveedores, markers y cancelación ya escritos                                            | Arrastra `@codingame/monaco-vscode-api`, que reimplementa buena parte de la API de servicios de VS Code. Decenas de MB. Además espera un Monaco parcheado por ellos, no el `monaco-editor` de [ADR-0002](./0002-monaco-editor.md) | **El presupuesto.** Son decenas de MB contra 22,3MB de margen de RNF-05. Y el acoplamiento al fork de Monaco es exactamente el tipo de dependencia que después no se puede sacar                    |
| **`vscode-languageclient`** | Es el cliente oficial, el mismo que corre adentro de VS Code                                                                                         | Está construido contra la API del extension host de VS Code: espera `workspace`, `window`, `languages`, `Uri` y el ciclo de vida de una extensión                                                                                 | Habría que **escribir un emulador del extension host** para usarlo, que es más código del que la librería ahorra —y código que hay que mantener contra una API que no controlamos—                  |
| **Framing a mano**          | Cero dependencias. El framing son ~40 líneas y el repo tiene precedente: `parseRipgrepLine`                                                          | Un parser con prefijo de longitud tiene estado: cabecera parcial, cuerpo partido en dos chunks, `Content-Length` mentiroso, encoding                                                                                              | El precedente **no aplica**: `parseRipgrepLine` es JSON por líneas sin máquina de estados. Acá un desfase de un byte desincroniza el stream para siempre, y el contenido lo influye un repo clonado |
| **`vscode-jsonrpc`** ✅     | Mantenido por Microsoft, mismo monorepo que la spec, **cero dependencias de runtime**, ~200KB de JS puro que Vite bundlea adentro del chunk del main | Una dependencia más                                                                                                                                                                                                               | —                                                                                                                                                                                                   |

## Consecuencias

- ✅ **El transporte no es nuestro.** El framing, la correlación de ids, `$/cancelRequest` y los errores de JSON-RPC los mantiene quien escribe la spec.
- ✅ **El ciclo de vida sigue en un solo lugar.** `client.ts` no lanza ni mata procesos: le pasa a `SupervisedProcess` un `requestGracefulExit` que manda `shutdown`/`exit` y un `onRestart` que rehace el `initialize`. Eso importa más de lo que parece: un servidor matado con SIGTERM deja huérfano al `tsserver` que él mismo lanzó.
- ✅ **El `positionEncoding` se verifica.** Declaramos `general.positionEncodings: ['utf-16']` y comprobamos el valor negociado en la respuesta de `initialize`. Un servidor que insista con utf-8 se marca `failed` con un mensaje, en vez de correr silenciosamente cada subrayado en todo archivo con un emoji. Son cuatro líneas y es el detalle de corrección más valioso de la integración.
- ✅ **Agregar un lenguaje es agregar una fila.** `LANGUAGE_SERVERS` en `packages/core` dice qué extensiones, qué argumentos, qué marcas de raíz y si el servidor viene empaquetado o sale de `lsp.serverPaths`. Nada del pipeline conoce a TypeScript por su nombre.
- ⚠️ **Los proveedores de Monaco los escribimos nosotros.** Es lo que `monaco-languageclient` habría dado gratis: mapear `CompletionItem`, `Hover` y `Location` entre LSP y Monaco es código propio y con sus propios bugs posibles. La mitigación es que las traducciones son puras y viven en `packages/core` con tests.
- ⚠️ **`typescript-language-server` sí se empaqueta** (844KB, cero dependencias de runtime), pero **`typescript` no**: el `tsserver` sale del `node_modules` del workspace vía `initializationOptions.tsserver.path`. El paquete son ~22MB —el margen entero de RNF-05—, es lo que hace VS Code con "use workspace version", y tipar un proyecto con una versión distinta a la que apunta su `tsconfig` produce errores que no existen. Sin TypeScript en el workspace el servidor no arranca y lo dice.
- ⚠️ **El main no guarda el texto de los documentos abiertos**, sólo su versión. Un reinicio del servidor lo deja sin saber nada, así que el registro olvida sus documentos y el renderer —que sí tiene el texto, en el modelo de Monaco— los reabre cuando ve el estado `running`. La alternativa era una segunda copia de cada archivo abierto en el proceso main, y con [RNF-03](../04-requerimientos-no-funcionales.md#performance) permitiendo archivos de 10MB eso es memoria que [RNF-04](../04-requerimientos-no-funcionales.md#performance) no tiene.
- ❌ **Cerramos la puerta a reusar extensiones de VS Code que aporten clientes LSP.** Eso era de todas formas incompatible con [ADR-0003](./0003-extension-host-aislado.md), que define una API de extensiones propia.
