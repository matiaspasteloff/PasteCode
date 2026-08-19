# ADR-0028: Adaptador DAP externo, configurado por ruta, con cliente propio

## Estado

`Aceptado`

**Fecha:** 2026-08-19

## Contexto

[RF-501 a RF-505](../03-requerimientos-funcionales.md) piden debugging: `launch.json`, breakpoints, controles de ejecución, variables y consola. Nada de eso lo implementa un IDE por su cuenta: lo implementa un **adaptador de debug**, un ejecutable que traduce entre el runtime que se está depurando y el **Debug Adapter Protocol**.

Hay dos preguntas y son independientes.

**La primera: de dónde sale el adaptador.** El mismo dilema que ya tuvimos tres veces —`ripgrep` ([ADR-0007](./0007-ripgrep-como-binario-externo.md)), `git` ([ADR-0019](./0019-git-con-spawn-crudo.md)) y los servidores de lenguaje ([ADR-0017](./0017-cliente-lsp-con-vscode-jsonrpc.md))— y con la misma tensión: empaquetarlo lo ata a nuestro calendario de releases y a [RNF-05](../04-requerimientos-no-funcionales.md), y no empaquetarlo deja la feature apagada hasta que alguien lo instale.

**La segunda: con qué se le habla.** DAP usa **el mismo encuadre que LSP** —`Content-Length: N\r\n\r\n` seguido del JSON— y ya tenemos `vscode-jsonrpc` en el proyecto para eso.

Y una tercera que el spike S3 tenía que contestar: **si el adaptador habla por stdio o por socket.**

## Decisión

**El adaptador es externo y se configura con `debug.adapterPath`, con la misma allow-list que `lsp.serverPaths`. El cliente es propio —ochenta líneas de encuadre— y no `vscode-jsonrpc`. El transporte es stdio, y el diseño deja el socket a un envoltorio de afuera.**

## Alternativas consideradas

### De dónde sale el adaptador

| Opción                                          | Pros                                                                                    | Contras                                                                                                       | Por qué no                                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Empaquetar uno**                              | Debugging que anda recién instalado, sin configurar nada                                | Ata nuestro release al suyo; pesa contra RNF-05; y elegimos por el usuario qué runtime se depura              | Es la misma decisión que ya se tomó tres veces al revés, y por las mismas razones |
| **Descargarlo al primer uso**                   | No pesa en el instalador y no hay que configurar nada                                   | Descargar y ejecutar un binario sin que nadie lo revise es exactamente lo que el modelo de amenazas no acepta | Convierte un IDE en un instalador de software de terceros                         |
| **Ruta configurada, allow-list del usuario** ✅ | Cero peso; el usuario elige qué runtime depura; misma regla que ya rige `git` y los LSP | Sin configurar, la feature está apagada                                                                       | —                                                                                 |

### Con qué se le habla

| Opción                    | Pros                                                                                                           | Contras                                                                                                                                                                                                      | Por qué no                                                                                                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`vscode-jsonrpc`**      | Ya está en el proyecto; el encuadre es idéntico                                                                | **DAP no es JSON-RPC.** Sus mensajes tienen `seq`, `type`, `command` y `request_seq`; no tienen `jsonrpc`, `id` ni `method`, y sus eventos no son notificaciones. Lo único compartido es el `Content-Length` | Habría que traducir cada mensaje en los dos sentidos, encima de una librería que además cancela y correlaciona con reglas que no son las de DAP. Más código y más frágil que escribir el encuadre |
| **Un cliente DAP de npm** | Nadie escribe encuadre                                                                                         | Los que existen son de VS Code y arrastran su modelo de extensiones entero; una dependencia grande para lo que son ochenta líneas                                                                            | Contra la regla 4 de `CLAUDE.md`: no se justifica el peso                                                                                                                                         |
| **Encuadre propio** ✅    | Ochenta líneas, sin dependencias de runtime; los **tipos** salen de `@vscode/debugprotocol`, que es sólo tipos | Hay que escribir —y testear— el manejo de chunks partidos                                                                                                                                                    | —                                                                                                                                                                                                 |

## Lo que contestó el spike S3

La pregunta era **si el adaptador habla por stdio o por socket**, mirando `vscode-js-debug` como caso testigo.

**No la contesté midiendo, y conviene decirlo en vez de disimularlo.** `vscode-js-debug` no está instalado en la máquina de desarrollo y la regla 7 de [`CLAUDE.md`](../../CLAUDE.md) es explícita: no se inventan APIs de DAP. Lo que sí sé con certeza es que el protocolo **no especifica el transporte** —especifica el encuadre y los mensajes— y que hay adaptadores que hacen las dos cosas.

Así que la decisión se tomó de forma que la pregunta **deje de importar**: el cliente recibe un `Readable` y un `Writable` y no sabe de dónde salen. Con stdio son los pipes del hijo; con socket serían los de un `net.Socket`, que es un dúplex igual. **Ninguna línea de `client.ts` cambia**, y lo que habría que agregar es el envoltorio que conecta y espera el puerto.

Es una respuesta más chica que la que S3 pedía, y es honesta: la alternativa era escribir código contra una invocación que no verifiqué.

## Consecuencias

- ✅ **Cero peso en el instalador y cero dependencias de runtime.** `@vscode/debugprotocol` es sólo tipos y va como `devDependency`; se borra al compilar.
- ✅ **El usuario elige qué runtime depura.** Node, Python o lo que sea: el IDE no tiene opinión, sólo habla el protocolo.
- ✅ **`debug.adapterPath` está en la allow-list del usuario, igual que `lsp.serverPaths` y `git.path`.** Un `.pastecode/settings.json` viaja adentro de cualquier repositorio que se clone; elegir el adaptador es elegir **qué se ejecuta al apretar F5**. `debug.adapterArgs` también, porque un `--eval` sobre un adaptador legítimo alcanza para ejecutar código.
- ✅ **El transporte es intercambiable sin tocar el cliente**, que es lo que deja la puerta abierta a un adaptador por socket.
- ⚠️ **Sin adaptador configurado no hay debugging.** Queda en _no configurado_ con un mensaje que nombra la clave a tocar, y el resto del IDE intacto — exactamente como pasa hoy sin `pyright` instalado.
- ⚠️ **El encuadre es nuestro, así que sus bugs son nuestros.** Los dos que muerden están cubiertos por tests: un mensaje partido en varios chunks, y `Content-Length` medido en **bytes** y no en caracteres. El segundo sólo se manifiesta cuando alguien pone una ñ o un emoji en un `console.log`, que es el peor momento para descubrir un bug de transporte.
- ⚠️ **El cuerpo de las respuestas se entrega sin verificar.** Los tipos de `@vscode/debugprotocol` describen lo que el protocolo _promete_; verificarlo en runtime sería transcribir a mano cientos de interfaces. Quien lo consume lo estrecha antes de mostrarlo, y hay un `eslint-disable` con esa justificación en el único lugar donde se afirma.
- ❌ **El adaptador no se reinicia solo**, a diferencia de los servidores de lenguaje. Un LSP relanzado vuelve a servir; una sesión de debug relanzada perdió el proceso que estaba depurando, sus breakpoints y su stack. Reintentar sería fingir que la sesión sigue viva: se avisa y se apaga.
