# ADR-0021: Partir el presupuesto de RAM en dos: sin servidores de lenguaje y con TypeScript activo

## Estado

`Aceptado`

**Fecha:** 2026-08-17

## Contexto

[RNF-04](../04-requerimientos-no-funcionales.md#performance) fija el consumo de memoria en **menos de 400MB con un workspace mediano y tres pestañas abiertas**. La sonda de la Etapa 3 midió 303,5MB, con margen cómodo.

La Etapa 4 agrega servidores de lenguaje, y ahí el número deja de tener sentido tal como está escrito. `tsserver` sobre un proyecto real ocupa entre 150 y 300MB **él solo**: no es un detalle de implementación nuestro sino cuánto pesa tener el grafo de tipos de un proyecto en memoria, y es aproximadamente lo mismo que ocupa adentro de VS Code.

Con un solo número quedan dos salidas y las dos son malas:

- **Dejar 400MB.** El presupuesto pasa a ser incumplible en cuanto alguien abre un `.ts`, que es el caso de uso central del producto. Un presupuesto que se viola siempre deja de medir nada y el CI aprende a ignorarlo.
- **Subirlo a 700MB.** El número deja de decir algo sobre la aplicación sin LSP —que es como arranca, y como se queda si sólo se abren archivos de markdown—. Una regresión de 200MB en el cascarón entraría sin que nadie se entere.

El proyecto ya tiene una decisión sobre cómo se escriben estos números: [ADR-0015](./0015-presupuestos-absolutos-de-performance.md) los fija **absolutos y no relativos**, precisamente para que no se puedan acomodar a lo que dio la medición.

## Decisión

**Dos presupuestos, los dos absolutos y los dos medidos en la misma corrida.**

| Escenario                                         | Techo   |
| ------------------------------------------------- | ------- |
| Sin servidores de lenguaje (`lsp.enabled: false`) | < 400MB |
| Con el servidor de TypeScript activo y tibio      | < 700MB |

`memory.perf.ts` gana un **escenario**, no un archivo nuevo: la misma sonda mide dos veces y reporta dos mediciones. La suite de performance se mantiene chica a propósito.

Se agrega además la mitigación que hace que el segundo número sea sostenible: **apagado por inactividad**, con `lsp.idleShutdownMinutes` en 5 por defecto. Un servidor que nadie usa hace media hora no tiene por qué seguir ocupando 200MB.

## Alternativas consideradas

| Opción                                      | Pros                                                             | Contras                                                                                                                | Por qué no                                                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Dejar RNF-04 en 400MB**                   | No se toca un requerimiento                                      | Incumplible con un `.ts` abierto, que es el caso central                                                               | Un presupuesto que se viola siempre deja de medir. El CI aprende a ignorarlo y con él se van las regresiones de verdad |
| **Subirlo a 700MB**                         | Un solo número, simple                                           | Deja de decir nada sobre la aplicación sin LSP: una regresión de 200MB en el cascarón entraría sin que nadie se entere | El presupuesto que más se usa —arrancar y mirar archivos— quedaría sin cubrir                                          |
| **Presupuesto relativo al de la rama base** | Se acomoda solo                                                  | Es exactamente lo que ADR-0015 descartó: una degradación lenta pasa todos los PRs de a poco                            | Contradice una decisión ya tomada, y por las mismas razones                                                            |
| **Dos presupuestos absolutos** ✅           | Cada escenario tiene su techo y los dos se miden en cada corrida | Una sonda que corre dos veces: la medición tarda el doble                                                              | —                                                                                                                      |

## Consecuencias

- ✅ **Los dos casos quedan cubiertos.** Una regresión en el cascarón la agarra el primer número aunque el segundo tenga margen de sobra.
- ✅ **El costo del LSP queda explícito y medido**, en vez de escondido adentro de un techo más alto. La diferencia entre los dos números _es_ cuánto cuesta la inteligencia de lenguaje, y es un dato que sirve para decidir.
- ⚠️ **La sonda de memoria tarda el doble.** Son dos arranques con mil archivos cada uno; se acepta porque es la única métrica de la suite que no fluctúa entre corridas y alcanza con una muestra por escenario.
- ⚠️ **El apagado por inactividad es parte del presupuesto, no un extra.** Sin él, una sesión larga acumula servidores de tres lenguajes y el segundo techo tampoco alcanza.
- ❌ **No se documenta un tercer escenario con Python o Rust activos.** Sus servidores no se empaquetan —salen de `lsp.serverPaths`— así que su consumo depende de una instalación que no controlamos, y un presupuesto sobre eso mediría la máquina de quien corre el test.
