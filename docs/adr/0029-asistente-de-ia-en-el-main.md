# ADR-0029: Asistente de IA sobre OpenRouter, con la llamada de red en el main y las escrituras bajo confirmación

## Estado

`Aceptado`

**Fecha:** 2026-08-20

## Contexto

`docs/01-vision-y-alcance.md` listaba "Integración de IA / autocompletado con LLM" como fuera de alcance. Esa línea salió por decisión explícita, y con ella aparecen tres preguntas que no se pueden dejar implícitas:

1. **De dónde salen los modelos.** Un IDE de portfolio no puede tener una factura variable atada a que alguien pruebe la demo, y tampoco puede pedirle a quien lo evalúa que cargue una tarjeta para ver si el asistente anda.
2. **Dónde vive la llamada HTTP.** La CSP de producción es `connect-src 'self'` ([seguridad.md](../convenciones/seguridad.md#content-security-policy), RNF-13) y el proyecto tiene **una sola** excepción documentada en toda su historia: `style-src 'unsafe-inline'`, por Monaco. Hablarle a `openrouter.ai` desde el renderer es una excepción nueva.
3. **Qué pasa cuando el modelo quiere escribir un archivo.** Un asistente que sólo lee es la mitad de útil. Uno que escribe cuando quiere es un proceso no privilegiado dictándole al privilegiado qué poner en el disco del usuario, con el agravante de que **lo que el modelo lee es entrada no confiable**: el contenido de un archivo del workspace puede contener instrucciones dirigidas al modelo, y ese archivo lo pudo escribir cualquiera.

Además, esto entra como **[etapa experimental](../01-vision-y-alcance.md#alcance-experimental)**: no cuenta contra el contrato de la v1, tiene que poder sacarse sin romper nada, y no puede costar peso de instalador contra el techo de 120MB de RNF-05.

## Decisión

**OpenRouter restringido a modelos gratuitos, la llamada HTTP en el proceso main, y toda escritura pasando por una confirmación con diff antes de tocar el disco.**

Los cinco puntos, en detalle:

**Proveedor: OpenRouter, sólo gratuitos.** La lista que se ofrece sale de `GET /api/v1/models`, filtrada a `pricing.prompt === '0' && pricing.completion === '0'`. Un modelo que no está en esa lista no aparece en el selector y el canal lo rechaza. Es un filtro de dos lados a propósito: el de la UI evita el error, y el del canal evita el abuso.

**La red vive en el main.** `ai/openrouter.ts` hace el `fetch` con `stream: true`, y los deltas viajan al renderer por el evento `ai:delta`. **La CSP del renderer no cambia**: sigue con `connect-src 'self'` y sin ninguna excepción nueva. Es el mismo criterio con el que ripgrep, git y los servidores de lenguaje ya viven del lado privilegiado.

**Streaming por evento, no por `invoke`.** Una respuesta son cientos de chunks y `invoke` sólo sabe responder preguntas — es literalmente el argumento de [ADR-0013](./0013-eventos-tipados-en-el-ipc.md) para `search:result`.

**Las herramientas de escritura no escriben.** Las de lectura (`list_files`, `read_file`, `search_workspace`) se resuelven en el main reusando `resolveInsideWorkspace` y el servicio de búsqueda. Las de escritura (`write_file`, `create_file`) emiten `ai:toolCall` y **esperan** el `ai:toolResult` del renderer, que llega recién cuando una persona apretó Aplicar o Descartar. Es exactamente el pull correlacionado de [ADR-0026](./0026-broker-unico-y-pull-del-documento-activo.md) (`extensions:documentRequest` / `extensions:documentResponse`): el main no le puede _preguntar_ nada al renderer, así que la pregunta viaja como evento con un `requestId` y la respuesta vuelve por un canal con schema.

**La clave, en `safeStorage`.** `encryptString` contra `userData/ai-credentials.bin`. Si `isEncryptionAvailable()` da falso, **la clave no se guarda** y se avisa; no hay fallback a texto plano. Y nunca vuelve al renderer: `ai:getKeyStatus` responde `{ hasKey: boolean }`.

**Cero dependencias nuevas.** `fetch` es nativo en Node 24, el parser de SSE son unas cuarenta líneas puras en `packages/core`, el markdown se resuelve partiendo prosa y bloques de código, y el diff de la confirmación usa `monaco.editor.createDiffEditor`, que ya está en el bundle.

## Alternativas consideradas

| Opción                                                                      | Pros                                                                                                                             | Contras                                                                                                                                                                                                                                             | Por qué no                                                                                               |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **SDK oficial de un proveedor**                                             | Tipos, reintentos y parseo de streaming ya resueltos                                                                             | Ata el IDE a un proveedor, suma megabytes contra RNF-05 y no resuelve la pregunta del costo: sigue haciendo falta una clave con saldo                                                                                                               | El parser de SSE que se evita son 40 líneas testeadas; el acoplamiento que se compra dura para siempre   |
| **`fetch` desde el renderer, ampliando `connect-src`**                      | Un salto de proceso menos, y el streaming se consume donde se pinta                                                              | Es una excepción nueva a la CSP, y la CSP del proyecto tiene **una sola** en toda su historia. Peor: la clave de API tendría que llegar al renderer para poder mandar el header                                                                     | Una clave que llega al renderer es una clave que cualquier XSS o extensión puede leer. La CSP no se toca |
| **Escribir directo y ofrecer "deshacer"**                                   | Menos fricción, y es lo que hacen varios asistentes                                                                              | "Deshacer" no existe para un archivo que no estaba abierto en el editor, y el modelo puede escribir varios de una. Y con el contenido del workspace como entrada no confiable, el peor caso deja de ser un error y pasa a ser una instrucción ajena | La confirmación es el único punto donde una persona ve qué se va a escribir **antes** de que se escriba  |
| **Modelo local (Ollama)**                                                   | Sin clave, sin costo y sin red                                                                                                   | Un modelo útil son gigabytes que el usuario baja e instala aparte, y el IDE queda dependiendo de un servidor externo que puede no estar corriendo                                                                                                   | Convierte "probá el asistente" en una instalación de media hora                                          |
| **Elegida: OpenRouter gratuito, red en el main, escrituras confirmadas** ✅ | Cero costo para quien lo prueba, CSP intacta, cero dependencias nuevas, y el patrón de pull correlacionado ya existía en el repo | El catálogo gratuito de OpenRouter cambia sin aviso: un modelo puede desaparecer o dejar de ser gratis, así que la lista se pide en vivo en vez de tenerla escrita                                                                                  | —                                                                                                        |

## Consecuencias

- ✅ La CSP de producción no cambia: sigue con `connect-src 'self'` y una sola excepción histórica.
- ✅ La clave de API nunca cruza al renderer, ni siquiera enmascarada.
- ✅ Sin clave configurada, el asistente no hace una sola llamada de red. La etapa experimental es invisible para quien no la quiere.
- ✅ Cero dependencias nuevas de runtime: RNF-05 queda donde estaba.
- ✅ Sacar la feature es borrar `schemas/ai.ts`, `main/ai/`, `features/ai/` y tres entradas de registro. La app sigue compilando.
- ⚠️ El catálogo gratuito de OpenRouter cambia sin aviso. Se pide en vivo, así que un modelo que desaparece se nota como "ya no está en el selector" y no como un error raro a mitad de una respuesta.
- ⚠️ Los modelos gratuitos tienen límites de tasa agresivos. Un 429 se muestra como lo que es, con el `userMessage` de `AiRequestError` (RNF-25).
- ⚠️ La confirmación agrega un paso a cada escritura. Es el costo aceptado: sin ella, un archivo del workspace puede dictarle al modelo qué escribir en otro.
- ❌ Se cierra la puerta al autocompletado inline: un modelo remoto por tecla no cabe ni en RNF-02 ni en los límites de tasa de un plan gratuito.
