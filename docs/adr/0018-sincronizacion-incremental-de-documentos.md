# ADR-0018: Sincronizar documentos con el servidor de lenguaje desde el renderer, incremental y con debounce

## Estado

`Aceptado`

**Fecha:** 2026-08-16

## Contexto

Un servidor de lenguaje sólo puede responder sobre documentos que conoce. El protocolo define cuatro notificaciones —`didOpen`, `didChange`, `didClose`, `didSave`— y el cliente es responsable de que el texto que el servidor tiene coincida **exactamente** con el que se está editando. Cuando no coincide, no falla nada de forma visible: el autocompletado ofrece el identificador que se acaba de borrar, los subrayados quedan una palabra corridos y la definición salta a la línea equivocada.

Tres restricciones se cruzan acá:

- **[RNF-02](../04-requerimientos-no-funcionales.md#performance): latencia de tecleo por debajo de 16ms en el p99.** La medición de la Etapa 3 dio 7,18ms, así que el margen es de 8,8ms por pulsación. Un salto de proceso por tecla se come una parte enorme de eso.
- **[RNF-03](../04-requerimientos-no-funcionales.md#performance) permite archivos de hasta 10MB.** Mandar el documento entero en cada notificación es serializar 10MB por tecla.
- **La única copia autoritativa del texto está en el renderer**, adentro del `ITextModel` de Monaco. El main tiene la ruta y nada más ([ADR-0017](./0017-cliente-lsp-con-vscode-jsonrpc.md)).

El error fácil es hacerlo en el main "porque el LSP vive ahí": obligaría a mantener una segunda copia de cada archivo abierto en el proceso privilegiado, sincronizada por IPC, que es el mismo problema pero con un participante más.

## Decisión

**El renderer acumula los cambios de Monaco, los descarga con un debounce trailing de 50ms y un techo de 200ms, y los manda siempre incrementales.** El main lleva sólo la versión de cada documento y descarta lo que no avance.

Cinco reglas, por orden de importancia:

1. **El renderer no invoca por tecla.** `features/lsp/document-sync.ts` acumula los `changes` de `onDidChangeContent` y descarga con el debounce. Diagnósticos 50ms tarde son invisibles; un frame perdido no.
2. **Cambios incrementales, nunca el documento entero.** Se declara `textDocument.synchronization` sin `didSave` y se manda `contentChanges` con rango.
3. **`version` es el `getVersionId()` de Monaco, pasado sin tocar**, leído **al descargar** y no al acumular: es la versión del documento que resulta de aplicar exactamente esos cambios.
4. **Una request de completado, hover o definición descarga el buffer pendiente primero.** Una línea, y elimina la clase entera de bugs de "me sugiere lo que acabo de borrar".
5. **Cancelación sin canal renderer→main:** single-flight por `(serverId, método)` en el main, con `CancellationTokenSource` de `vscode-jsonrpc` → `$/cancelRequest`. El evento que cancela una request es la request siguiente, y ésa ya viene sola.

El ciclo de vida se cuelga de **los modelos** —`onDidCreateModel` y `onWillDisposeModel`— y no de la lista de pestañas.

## Alternativas consideradas

| Opción                                       | Pros                                                                                 | Contras                                                                                                                                                       | Por qué no                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Sincronizar desde el main**                | Todo el LSP en un solo proceso; el renderer no sabe que el protocolo existe          | Obliga a una segunda copia de cada archivo abierto en el main, sincronizada por IPC. Con RNF-03 en 10MB, es memoria contra RNF-04 y una fuente de desincronía | Es el mismo problema con un participante más. El texto ya está en un solo lugar: el modelo de Monaco                 |
| **`TextDocumentSyncKind.Full`**              | Trivial: se manda `getValue()` y listo. Imposible de desincronizar                   | Serializa el documento entero en cada descarga                                                                                                                | 10MB por descarga contra RNF-02 y RNF-03. La simplicidad se paga en el único lugar donde no hay presupuesto          |
| **Mandar cada cambio apenas ocurre**         | Latencia mínima: el servidor ve la tecla en el momento                               | Un salto de proceso por pulsación, con serialización y validación Zod en el medio                                                                             | Contra 8,8ms de margen de RNF-02, es gastar el presupuesto de tipeo en un diagnóstico que nadie va a leer 50ms antes |
| **Debounce sin techo**                       | Una regla en vez de dos                                                              | Escribir sin parar durante un minuto no manda nada en todo ese minuto: cada tecla reagenda                                                                    | El techo son tres líneas y garantiza que el servidor vea el documento cinco veces por segundo mientras se tipea      |
| **Acumular con debounce de 50ms y techo** ✅ | El servidor va al día sin que el tipeo lo pague; los rangos incrementales son chicos | Hay que acumular en orden y descargar antes de cada request                                                                                                   | —                                                                                                                    |

## Consecuencias

- ✅ **Tipear no cruza el IPC.** En el peor caso hay 5 mensajes por segundo por documento, con rangos de unos pocos caracteres cada uno.
- ✅ **La guarda de versión vive en un solo lugar.** El main descarta cualquier descarga con versión menor o igual a la última registrada. Una descarga vieja que llega después de un `close`/`reopen` no es un error del renderer —es la carrera normal entre un debounce y una pestaña que se cierra—, pero aplicarla sí lo sería: a partir de ahí todos los rangos del servidor están corridos, y nada vuelve a estar bien hasta reiniciarlo.
- ✅ **El orden de los cambios de Monaco se respeta tal cual viene**, que es de atrás hacia adelante en el documento. LSP aplica el lote en secuencia, así que empezar por el final es lo que mantiene válidos los desplazamientos de los que quedan. Reordenarlos rompe cualquier edición multi-cursor.
- ⚠️ **Hay una ventana de hasta 50ms en la que el servidor sabe menos que la pantalla.** La regla 4 la cierra para lo que se pregunta explícitamente —completado, hover, definición—; para los diagnósticos se acepta, porque un subrayado que aparece 50ms tarde nadie lo nota.
- ⚠️ **Colgarse de los modelos y no de las pestañas** significa que un modelo creado por una restauración de sesión abre su documento aunque nadie lo esté mirando. Es deliberado: el servidor tiene que poder analizarlo, y la alternativa —esperar a que la pestaña se active— hace que restaurar una sesión de ocho archivos muestre errores de a uno.
- ❌ **No se manda `didSave`.** El servidor de TypeScript no lo necesita y el watcher ya cubre los cambios que vienen de afuera del editor. Se agrega el día que un servidor lo pida de verdad.
