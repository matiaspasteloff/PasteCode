# ADR-0025: Entregar la API por parámetro de `activate` y mantenerla sólo tipos

## Estado

`Aceptado`

**Fecha:** 2026-08-18

## Contexto

[RF-903](../03-requerimientos-funcionales.md) tiene su criterio de aceptación escrito como código:

```ts
pastecode.commands.registerCommand(id, handler);
```

Y [RF-905](../03-requerimientos-funcionales.md) escribe el suyo como `pastecode.window.activeTextEditor.edit()`. Los dos dan por sentado que existe un objeto llamado `pastecode` al alcance de la extensión, y ninguno dice de dónde sale. Ésa es la decisión: **cómo llega ese objeto a las manos de código de terceros que corre en otro proceso**.

La pregunta no es cosmética. En VS Code, `import * as vscode from 'vscode'` funciona porque el host parchea la resolución de módulos de Node: intercepta el `require` del especificador `vscode` y devuelve un objeto que armó él. Es maquinaria real —y frágil— puesta al servicio de que un objeto se llame de una manera.

Alrededor hay tres fuerzas que aprietan:

- **La regla 5 de [`CLAUDE.md`](../../CLAUDE.md)**: el paquete que las extensiones importan no puede arrastrar Electron, React ni I/O. Si `@pastecode/extension-api` tuviera runtime, cada extensión traería una copia de la lógica interna del IDE.
- **El límite de proceso.** La extensión corre en el extension host ([ADR-0003](./0003-extension-host-aislado.md)), la UI en el renderer y la autoridad en el main. Toda llamada de la API cruza al menos un salto, y el [modelo de amenazas](../convenciones/seguridad.md#modelo-de-amenazas--extensiones) le pone un techo de 5 s.
- **El texto no está en el main.** [`lsp/documents.ts`](../../apps/desktop/src/main/lsp/documents.ts) guarda versión y nada de texto, a propósito: con [RNF-03](../04-requerimientos-no-funcionales.md) permitiendo archivos de 10MB, un espejo de cada archivo abierto es memoria que [RNF-04](../04-requerimientos-no-funcionales.md) no tiene.

## Decisión

**El módulo de la extensión exporta `activate(pastecode)` y `deactivate()`, el parámetro se llama `pastecode`, y `@pastecode/extension-api` es sólo tipos: cero runtime, cero dependencias. Todo lo que cruza el límite de proceso es asincrónico y serializable.**

## Alternativas consideradas

| Opción                                             | Pros                                                                                                                                                      | Contras                                                                                                                                                                                        | Por qué no                                                                                                                                                            |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`import * as pastecode from 'pastecode'`**       | Es lo que la gente que viene de VS Code espera; el import se ve en la primera línea del archivo                                                           | Obliga a parchear la resolución de módulos del host; el paquete deja de ser sólo tipos; y el objeto queda igual para todos, así que recortarlo por `capabilities` pide un loader por extensión | Maquinaria grande para un beneficio de familiaridad. Y el parche vive en el proceso donde corre código de terceros, que es el peor lugar del sistema para tener magia |
| **`globalThis.pastecode`**                         | Cero maquinaria: el host lo asigna antes de importar el módulo                                                                                            | Es estado global compartido por todas las extensiones del host: la que se activa segunda pisa a la primera                                                                                     | Hace que dos extensiones no puedan tener permisos distintos, que es exactamente lo que [RNF-14](../04-requerimientos-no-funcionales.md) pide                          |
| **API sincrónica con espejo del texto en el main** | `document.text` como propiedad; el código de la extensión se lee más corto                                                                                | Una segunda copia de cada archivo abierto; y una API sincrónica sobre un límite de proceso es una mentira que se paga en deadlocks                                                             | Rompe RNF-04 de frente, y contradice la razón documentada por la que `lsp/documents.ts` no guarda texto                                                               |
| **`activate(pastecode)`** ✅                       | El código se lee igual que el criterio de aceptación; el paquete queda sólo tipos; cada extensión recibe **su** objeto, ya recortado por sus capabilities | El objeto hay que pasarlo hacia abajo, o guardarlo en un módulo, en extensiones grandes                                                                                                        | —                                                                                                                                                                     |

## Lo que sale de la decisión

Cinco consecuencias de forma que valen tanto como la decisión de fondo.

**1. No hay `context.subscriptions`.** En VS Code hace falta porque el host no sabe qué registró cada extensión. Acá el main brokerea _todas_ las llamadas, así que ya tiene esa atribución: dar de baja lo de una extensión que se descarga no necesita que la extensión colabore. El `Disposable` que devuelve cada registro sirve para soltar algo **antes** de tiempo, no para poder apagar la luz al salir. `deactivate()` queda para los recursos propios —un timer, un archivo abierto—, que es lo único que el IDE no puede ver.

**2. Los setters de la status bar son métodos asincrónicos, no propiedades.** `item.text = 'x'` anda en VS Code porque la asignación y la UI están en el mismo proceso. Acá hay dos saltos de por medio, así que una propiedad asignable sería una operación que puede fallar disfrazada de asignación: sin nada que esperar y sin dónde ver el error. `await item.setText('x')` es más largo de escribir y no miente.

**3. `activeTextEditor` se lee sincrónicamente, pero su texto no.** El metadato —`path`, `languageId`, `version`— es chico y acotado, así que el IDE lo empuja y la extensión lo lee de una propiedad. El texto se pide con `getText()`, que es un ida y vuelta hasta el renderer. Es la mitad pública del pull correlacionado; la mecánica del broker es de ADR-0026.

**4. El editor es una instantánea, no un objeto vivo.** Refleja el estado del último evento. Guardarlo en una variable y usarlo cinco minutos después es mirar el pasado. Lo que se guarda es la suscripción.

**5. `documentRead` y `documentWrite` están partidas.** El [modelo de datos](../05-modelo-de-datos.md#manifest-de-extensión) nombraba sólo `documentRead`, pero RF-905 pide _leer y modificar_, y `word-count` necesita lo primero y no lo segundo. Una sola capability obligaría a pedir permiso de escritura para no usarlo nunca, que es exactamente cómo los permisos dejan de significar algo.

## Consecuencias

- ✅ El código de una extensión se lee **igual** que el criterio de aceptación del requerimiento, sin resolución de módulos falsa.
- ✅ `@pastecode/extension-api` no tiene `dependencies`, ni siquiera Zod. Es publicable tal cual y no puede arrastrar lógica interna del IDE a una extensión.
- ✅ Cada extensión recibe su propio objeto, así que recortarlo por sus `capabilities` no necesita un proceso por extensión.
- ✅ `main` es **opcional** en el manifest: una extensión que sólo aporta un tema no tiene código, y exigirle un `activate` vacío obligaría a cargar y ejecutar un módulo de terceros para pintar colores.
- ⚠️ **El tipo del manifest vive en dos lados.** Acá como tipo, y en el loader (paso 33) como schema de Zod, porque este paquete no tiene dependencias. El paso 33 los ata con un chequeo de tipos, no con buena voluntad: si se separan, el error tiene que salir en `pnpm typecheck` y no en un manifest que no carga.
- ⚠️ **Un tema de terceros no pasa por la compuerta de contraste de [RNF-22](../04-requerimientos-no-funcionales.md).** `scripts/check-contrast.mjs` mide `tokens.css`, que es el tema de fábrica; un tema instalado se aplica tal como viene. Es la consecuencia aceptada de dejar que alguien más elija los colores. El `theme-nord` propio sí se ajustó para pasar 4.5:1: la paleta Nord original no llega con sus rojos y violetas sobre su propio fondo.
- ⚠️ **Toda llamada de la API es `await`.** Registrar un comando es una `Promise`. Es más ruidoso que la alternativa sincrónica y es la forma honesta de un límite de proceso.
- ❌ **No hay namespace de settings en esta etapa.** El manifest de ejemplo del modelo de datos muestra un `contributes.configuration`, pero la API de la Etapa 5 no tiene con qué leerlo, así que `word-count` no lo declara: contribuir una opción que nadie puede leer es una feature que existe sólo en la documentación.
- ❌ **Nada de la API es sincrónico salvo leer metadato ya empujado.** Una extensión que necesite una respuesta inmediata del IDE no la va a tener, y eso es a propósito: es el techo de 5 s del modelo de amenazas convertido en forma.
