# ADR-0032: Tres modos para el asistente, edición directa en modo agente y panel propio a la derecha

## Estado

`Aceptado` · **Supersede parcialmente a [ADR-0029](./0029-asistente-de-ia-en-el-main.md)**

**Fecha:** 2026-08-22

## Contexto

[ADR-0029](./0029-asistente-de-ia-en-el-main.md) dejó el asistente andando con tres límites que se volvieron el techo de lo que puede hacer:

1. **No edita: propone.** `write_file` y `create_file` emiten `ai:toolCall` y **esperan** un `ai:toolResult`. Cada escritura pasa por una tarjeta con diff y dos botones. Es el diseño explícito de aquel ADR, y funciona; lo que no funciona es pedirle "arreglá los tres lugares donde se usa esta función" y tener que aprobar tres diffs de a uno, releyendo cada vez lo que ya se leyó.
2. **Un solo comportamiento.** No hay forma de decirle "sólo respondeme", "sólo planificá" o "hacelo". Un asistente que siempre puede escribir es incómodo cuando lo único que se quiere es entender un archivo, y uno que nunca escribe es inútil cuando lo que se quiere es que lo haga.
3. **Vive a la izquierda**, como cuarta entrada de `SIDE_VIEWS`, compitiendo por la misma columna que el explorador, la búsqueda y Git — que son exactamente las tres cosas que uno quiere tener a la vista **mientras** le habla al asistente.

Hay además un cuarto problema, más chico y más caro: `write_file` exige el **contenido final completo** del archivo. Con modelos gratuitos eso falla seguido sobre archivos medianos —se cortan, se olvidan una función del medio— y quema cuota de la persona en cada intento.

## Decisión

**Tres modos (`ask` / `plan` / `agent`) decididos en el main, edición directa con checkpoints sólo en modo agente, `apply_edit` como herramienta de reemplazo exacto, y un panel auxiliar propio a la derecha.**

### Los modos

| Modo    | Herramientas declaradas al modelo                    | Escribe      | Tope de vueltas |
| ------- | ---------------------------------------------------- | ------------ | --------------- |
| `ask`   | `list_files`, `read_file`, `search_workspace`        | no           | 4               |
| `plan`  | las mismas tres                                      | no           | 6               |
| `agent` | las tres + `apply_edit`, `write_file`, `create_file` | **sí, solo** | 16              |

`ask` y `plan` se diferencian **sólo por el prompt de sistema**: `plan` termina con un plan escrito y tiene prohibido decir que hizo algo. Que ninguno de los dos vea las herramientas de escritura no es cosmético — **es lo que impide que el modelo las llame**. Un prompt es una sugerencia; una lista de herramientas es un hecho.

La lógica vive en `packages/core/src/ai/modes.ts` como cuatro funciones puras (`toolsForMode`, `canWriteInMode`, `maxTurnsForMode`, `modeInstructions`), por la misma razón que `freeModels` y `trimToBudget`: es lógica de dominio sin I/O, y se testea sin levantar nada.

### Dónde se decide `autoApply`

El modo viaja en `ai:chat` y **el main** decide, con `canWriteInMode(mode)`, si el `ai:toolCall` sale con `autoApply: true`. El renderer no inventa el permiso: lo recibe. Esto no le da privilegios nuevos —ya podía llamar a `fs:writeFile` por su cuenta—; lo que compra es que **el modelo nunca ve una herramienta que en ese modo no puede usar**, y que la política vive de un solo lado en vez de repartida entre dos procesos.

### La red de seguridad: checkpoints

La objeción de ADR-0029 a escribir directo era textual: _«Deshacer» no existe para un archivo que no estaba abierto en el editor, y el modelo puede escribir varios de una._ Sigue siendo cierta y es exactamente lo que los checkpoints resuelven.

`previousContent` **ya viajaba** adentro de `ai:toolCall` —lo necesitaba el diff—, así que guardarlo alcanza para un **Revertir** por archivo y un **Revertir todo** por turno. Eso hace existir el "deshacer" para archivos que no estaban abiertos, que era justamente el agujero que el ADR señalaba. Revertir un archivo que el asistente creó es `fs:delete`, que usa `shell.trashItem` y no `rm`: deshacer una creación no puede ser un borrado sin vuelta atrás.

Los checkpoints **no se limpian al terminar el turno**: hacen falta justo después, cuando la persona lee lo que el asistente contó y decide. Se tiran al empezar una conversación nueva.

### La frontera de seguridad no se mueve

- La validación de rutas sigue en el main (`resolveInsideWorkspace`), sin excepción y sin importar el modo.
- La escritura sigue siendo del renderer por `fs:*`: misma escritura atómica de RNF-07, mismo `noteOwnWrite`. Lo que cambió es quién aprieta el botón, no quién resuelve la ruta.
- La defensa contra prompt injection **se refuerza** en `agent` en vez de aflojarse: es el modo donde una instrucción escondida en un archivo del workspace no pasaría por ningún botón, así que el prompt lo dice dos veces.
- La CSP, el filtro de modelos gratuitos y `safeStorage` no se tocan. Cero dependencias nuevas.

### `apply_edit`

Reemplazo exacto, con `{ path, oldText, newText, replaceAll? }`. **La clave del diseño es que el main lo resuelve al mismo shape que las otras dos** (`{ path, nextContent, previousContent }`) dentro de `resolveWriteProposal`: el evento, la tarjeta de diff, el checkpoint y el camino de escritura no cambian en absoluto para la herramienta nueva.

Una coincidencia ambigua **falla** en vez de tomar la primera. Dos apariciones iguales significan que el modelo no miró suficiente contexto, y elegir por él es elegir mal la mitad de las veces; el error vuelve como texto —"agregá contexto alrededor"— para que reintente.

### El panel a la derecha

`AUX_VIEWS` y `auxView` en el view-store, con su propio registro. El descriptor del asistente se mudó de `SIDE_VIEW_REGISTRY` a `AUX_VIEW_REGISTRY` **sin cambiar una línea**, que es la tercera prueba de que el registro de [ADR-0022](./0022-cascaron-con-barra-de-actividades.md) aguanta. Se abre desde un botón nuevo de la barra de título, que dispara el **comando** `ai.toggle` y no la acción del store — la misma regla de ADR-0022: si el botón y el atajo no pasan por el mismo lugar, divergen.

### Los dos peligros que había que cubrir

Los dos ya existían en el camino confirmado, pero pasan de raros a constantes cuando el agente escribe solo:

1. **Buffer sucio pisado.** La escritura va sin `expectedMtimeMs`. Si el archivo tiene una pestaña con cambios sin guardar, la escritura de la IA los pisa en disco y el `Ctrl+S` posterior vuelve a pisar a la IA. → **Guarda:** si el path tiene pestaña sucia no se escribe, y se le informa `failed` al modelo.
2. **Buffer limpio desactualizado.** `fs:writeFile` llama a `noteOwnWrite`, así que el watcher **no** emite `files:changed` y `applyExternalChanges` nunca corre: una pestaña abierta y limpia queda mostrando el contenido viejo. → **Arreglo:** `adoptExternalWrite` lleva el contenido al modelo de Monaco y actualiza `mtimes`, que es lo que evita un `STALE_FILE` falso en el próximo guardado.

## Alternativas consideradas

| Opción                                                            | Pros                                                                                                                                        | Contras                                                                                                                                                                                                                                    | Por qué no                                                                                                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Seguir con confirmación siempre**                               | Es el statu quo de ADR-0029: cero riesgo nuevo, y la persona ve cada cambio antes de que exista                                             | Convierte cualquier tarea de más de un archivo en una fila de diffs que hay que releer de a uno. Y con la confirmación como única defensa, la fricción termina haciendo que se apruebe sin mirar — que es peor que no tenerla              | La confirmación protege de escrituras no deseadas, y los checkpoints protegen igual **después** del hecho, sin cobrar el peaje en cada una            |
| **Auto-apply detrás de una setting**                              | Una sola forma de trabajar por vez, sin selector en la UI, y quien no la activa no cambia de comportamiento                                 | Una setting global es un estado invisible que decide si un archivo se escribe solo. Alguien que la prendió el martes le pide algo el jueves sin acordarse, y el modo con el que trabajó no queda escrito en ningún lado de la conversación | El modo tiene que ser **visible y por pregunta**, no una preferencia que se olvida. Un selector arriba del chat lo dice cada vez que se mira el panel |
| **Un solo modo agente, sin `ask` ni `plan`**                      | Menos superficie: un comportamiento, un prompt, una lista de herramientas                                                                   | El modelo con herramientas de escritura declaradas las usa aunque nadie se lo pida: una pregunta de "¿qué hace esto?" termina en un archivo editado. Y "planificá antes de tocar nada" pasa a depender de que el modelo obedezca el prompt | Sacarle las herramientas es la única forma dura de que no escriba, y eso es un modo                                                                   |
| **Deshacer con el historial de Monaco en vez de checkpoints**     | Ya existe, es por archivo y lo entiende cualquiera                                                                                          | Es exactamente lo que ADR-0029 descartó: no existe para un archivo que no estaba abierto en el editor, y el agente escribe varios de una                                                                                                   | El checkpoint no depende de que el archivo esté abierto, porque el contenido anterior lo trae el propio evento                                        |
| **Dejar el asistente en la barra lateral**                        | Cero cambios en el cascarón                                                                                                                 | Compite por la columna con el explorador, la búsqueda y Git, que son lo que uno quiere ver mientras le habla. Y con 16rem de `--sidebar-width` un chat con diffs adentro es ilegible                                                       | Un eje propio a la derecha los deja convivir, y es una entrada en un registro que ya existía                                                          |
| **Elegida: modos en el main, edición directa con checkpoints** ✅ | El asistente hace el trabajo en vez de dictarlo, y sigue siendo reversible. La frontera de seguridad no se movió y no entró una dependencia | Hay tres comportamientos que documentar y probar en vez de uno, y el modo agente puede escribir algo que nadie quería — reversible, pero escrito                                                                                           | —                                                                                                                                                     |

## Qué de ADR-0029 queda sin efecto

**Sin efecto:** la decisión de que "las herramientas de escritura no escriben" **en modo agente**, y la fila de alternativas que descartaba _"escribir directo y ofrecer deshacer"_. El argumento de aquella fila —que "deshacer" no existe para un archivo cerrado— era correcto y por eso esta decisión no lo ignora: lo resuelve con checkpoints, que no dependen de que el archivo esté abierto.

**Sigue vigente todo lo demás**, y es la mayor parte: la red vive en el main y la CSP no se toca, sólo se ofrecen modelos gratuitos y el canal lo verifica además de la UI, la clave va en `safeStorage` y nunca vuelve al renderer, el streaming va por evento y no por `invoke`, la validación de rutas pasa por `resolveInsideWorkspace` sin excepción, y cero dependencias nuevas. **En modo `ask` y `plan`, la confirmación de ADR-0029 sigue siendo el camino tal cual estaba escrito.**

## Consecuencias

- ✅ El asistente hace el trabajo en modo agente: lee, edita y crea sin pedir permiso archivo por archivo.
- ✅ Cada escritura es reversible desde la conversación, incluso la de un archivo que nunca estuvo abierto en el editor.
- ✅ `ask` y `plan` no pueden escribir **por construcción**, no por obediencia: no reciben la declaración de las herramientas.
- ✅ `apply_edit` baja el costo de una edición chica de "el archivo entero" a "el fragmento", que es la diferencia entre que un modelo gratuito acierte y que no.
- ✅ El asistente y el explorador conviven: son dos columnas distintas.
- ⚠️ En modo agente el asistente puede escribir algo que nadie quería. Es reversible, pero fue escrito: el modo arranca en `agent` porque es donde es útil, y lo que lo hace defendible es el checkpoint, no la confianza en el modelo.
- ⚠️ **La pérdida de contexto entre turnos se nota más.** `toWire` descarta `toolCallId` y los `WireMessage` de rol `tool` nunca vuelven al renderer: si el agente lee tres archivos y contesta, en la pregunta siguiente esos resultados ya no existen. Arreglarlo es rediseñar qué guarda el renderer de la conversación, y eso es RF-1009.
- ⚠️ El modo **no se persiste**. Cada sesión arranca en `agent`. Es la misma limitación que la conversación, y el mismo RF-1009.
- ⚠️ El panel es de ancho fijo por token, como todo el resto del cascarón. Redimensionarlo no está.
- ❌ Se cierra la puerta a que `ask` o `plan` escriban "por si acaso" con una confirmación: si el modelo pide una herramienta que ese modo no declaró, se le responde que no está disponible y no se emite ningún `ai:toolCall`.
