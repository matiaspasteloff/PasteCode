# ADR-0026: Brokear todo por el main y traer el documento activo con un pull correlacionado

## Estado

`Aceptado`

**Fecha:** 2026-08-18

## Contexto

[RF-905](../03-requerimientos-funcionales.md) pide leer y **modificar** el documento activo desde una extensión. La solución natural sería un espejo del texto en el main, y no se puede: [`lsp/documents.ts`](../../apps/desktop/src/main/lsp/documents.ts) declara en su JSDoc que guarda la versión y nada del texto, y explica por qué. Con [RNF-03](../04-requerimientos-no-funcionales.md) permitiendo archivos de 10MB, una segunda copia de cada archivo abierto es memoria que [RNF-04](../04-requerimientos-no-funcionales.md) no tiene. El texto vive sólo en el modelo de Monaco, en el renderer.

Y el main no puede preguntarle nada al renderer. La **regla 6 de IPC** de [`docs/02-arquitectura.md`](../02-arquitectura.md) dice que los eventos van del main al renderer y nunca al revés: el renderer pregunta con `invoke`, el main avisa con eventos. No hay un `invoke` del main hacia el renderer, y agregarlo sería agregar una dirección al modelo de IPC entero para un solo caso de uso.

Queda una tercera pregunta, más grande: **quién habla con quién**. Hay tres procesos —main, renderer, host— y una extensión que quiere poner algo en la status bar toca los tres. [ADR-0003](./0003-extension-host-aislado.md) definió el aislamiento del host, pero sólo cubrió la pata main ↔ host.

## Decisión

**El main es el único broker: el host y el renderer nunca se hablan entre sí. Y el documento activo se trae con un pull correlacionado, armado con los dos primitivos que ya existen — un evento hacia el renderer con un `requestId`, y un canal `invoke` de vuelta con la respuesta.**

```
extensión pide el texto
  → host --RPC--> main
  → main --evento `extensions:documentRequest { requestId }`--> renderer
  → renderer --canal `extensions:documentResponse { requestId, text }`--> main
  → main --RPC--> host
```

Este ADR **extiende [ADR-0003](./0003-extension-host-aislado.md)**, que sólo cubría la pata main ↔ host.

## Alternativas consideradas

| Opción                                          | Pros                                                                                                                                      | Contras                                                                                                   | Por qué no                                                                                                                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Espejo del texto en el main**                 | La lectura es sincrónica y no cuesta ningún salto                                                                                         | Una segunda copia de cada archivo abierto, hasta 10MB cada una                                            | Rompe RNF-04 de frente, y contradice la razón documentada por la que `lsp/documents.ts` ya decidió no guardar texto                                                            |
| **`MessagePort` directo entre host y renderer** | Un salto en vez de dos; es lo que `utilityProcess` habilita                                                                               | El main deja de ver lo que pasa, así que no puede verificar capabilities ni atribuir registros            | Convierte [RNF-14](../04-requerimientos-no-funcionales.md) en una promesa sin nadie que la haga cumplir. El proceso que quedaría a cargo es el que corre el código de terceros |
| **Un `invoke` del main hacia el renderer**      | La pregunta y la respuesta quedan en una sola llamada                                                                                     | Agrega una dirección al modelo de IPC entero para un solo caso de uso, y rompe la regla 6 de arquitectura | El costo se paga en todo el proyecto para siempre; el pull se paga sólo cuando una extensión pregunta                                                                          |
| **Push del texto en cada cambio**               | La extensión ya lo tiene cuando lo necesita                                                                                               | Cada tecla serían dos saltos de proceso con el archivo entero adentro                                     | Es exactamente lo que RNF-02 no soporta, y le cobra a todos el costo de lo que usa una extensión                                                                               |
| **Pull correlacionado por el main** ✅          | Sin espejo; sin dirección nueva de IPC; el main ve todo y puede negar lo que no se declaró; el costo se paga sólo cuando alguien pregunta | Dos saltos por lectura, y una respuesta que puede no llegar                                               | —                                                                                                                                                                              |

## Consecuencias

- ✅ **Las capabilities se verifican donde se pueden hacer cumplir.** El main es el único proceso que no corre código de terceros, así que es el único cuyo chequeo significa algo. Un `documentWrite` no declarado es un error con su `code`, no un método ausente.
- ✅ **Descargar una extensión es borrar entradas de dos mapas.** El main ya tiene la atribución de todo lo que registró cada una, así que no hace falta que la extensión colabore — que es lo que permitió que la API pública no tuviera `context.subscriptions` ([ADR-0025](./0025-forma-de-la-api-de-extensiones.md)).
- ✅ **El evento de documento activo no lleva texto**, sólo `path`, `languageId` y `version`. `word-count` pide el contenido cuando lo necesita, con debounce.
- ✅ **La `version` de Monaco hace de token de concurrencia sin contar nada a mano.** Una edición que llega con una versión vieja no se aplica y devuelve `false`. Es la única respuesta honesta de un modelo sin espejo: la alternativa es pisar lo que alguien acaba de escribir.
- ⚠️ **Dos saltos de proceso por lectura.** Es el precio de no tener espejo, y se paga sólo cuando una extensión pregunta.
- ⚠️ **El pull tiene su propio timeout de 5 s.** Una ventana que se cierra mientras una extensión pregunta deja la promesa sin respuesta; se resuelve como "no hay texto" en vez de rechazar, porque no es un error de la extensión.
- ⚠️ **La pregunta va a una sola ventana, la primera.** El documento activo es el de la ventana con foco; mandársela a todas produciría tantas respuestas como ventanas para un único `requestId`. Con multi-ventana de verdad esto hay que revisarlo.
- ❌ **El host no puede hablarle al renderer.** Cierra la puerta a que una extensión aporte UI propia sin pasar por el main, que es una feature que este proyecto no tiene en alcance y que, si algún día la tuviera, merece su propio ADR.
