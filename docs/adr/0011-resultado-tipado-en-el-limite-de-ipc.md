# ADR-0011: Devolver un resultado tipado y errores serializados en el límite de IPC

## Estado

`Aceptado`

**Fecha:** 2026-08-15

## Contexto

La [convención de código](../convenciones/codigo.md#3-los-errores-esperables-se-devuelven-no-se-lanzan) manda devolver los errores esperables en vez de lanzarlos. En un módulo cualquiera eso es una preferencia de estilo defendible; en el IPC deja de serlo, porque el límite entre el main y el renderer no preserva excepciones.

Cuando un handler de `ipcMain.handle` lanza, Electron serializa el error y rechaza la promesa del otro lado con **un `Error` genérico**: el `message` llega prefijado con texto de Electron y el resto de las propiedades no llega. Un `PasteCodeError`, cuya razón de existir es justamente separar `code` de `userMessage` y de `message`, pierde las dos cosas que lo hacen útil exactamente al cruzar. El renderer se queda con una cadena de texto técnica, en inglés, que no puede ni mostrar ([RNF-25](../04-requerimientos-no-funcionales.md#usabilidad-y-accesibilidad) prohíbe mostrar el `message`) ni interpretar (no hay `code` contra el cual ramificar).

El momento importa: la Etapa 2 abre los primeros cinco canales de un contrato que va a llegar a unos cuarenta. La [guía](../00-guia-paso-a-paso.md) advierte esto en el paso 12 — si el patrón de IPC queda mal, se arrastra a todos los canales que vienen. Cambiar la forma de la respuesta con cinco canales cuesta una tarde; con cuarenta, es una semana y un montón de conflictos.

Las fuerzas en juego:

- El renderer necesita **distinguir** un error esperable ("el archivo es binario") de un bug del handler, y necesita **algo que se le pueda mostrar a una persona**.
- El renderer **no es de confianza** ([seguridad](../convenciones/seguridad.md#validación-de-input-en-ipc)): un `message` técnico puede contener rutas del disco o fragmentos del entorno, así que no todo lo que el main sabe debería cruzar.
- El código del main encadena guards (`resolveInsideWorkspace`, validaciones de tamaño y de contenido). Propagar un `Result` a mano por cada capa interna vuelve ilegible lo que hoy se lee de corrido, y contradice el estilo `assert*` que la propia [convención de seguridad](../convenciones/seguridad.md#validación-de-rutas) documenta con `@throws`.

## Decisión

**Todo canal de IPC responde `IpcResult<T>`, y la forma se declara una sola vez en el tipo `PasteCodeApi` en vez de canal por canal.**

```typescript
// packages/ipc-contract/src/result.ts
export interface SerializedError {
  code: string;
  userMessage: string;
}

export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: SerializedError };
```

```typescript
// packages/ipc-contract/src/api.ts
export interface PasteCodeApi {
  invoke<C extends ChannelName>(
    channel: C,
    payload: Request<C>
  ): Promise<IpcResult<Response<C>>>;
}
```

El envoltorio no vive en cada entrada de `IpcChannels` a propósito: si viviera ahí, agregar un canal incluiría la decisión de si sus errores viajan bien, y esa es exactamente la decisión que no queremos volver a tomar cuarenta veces.

Del lado del main hay un único registrador, `registerHandler`, que hace las tres cosas que todo canal necesita: valida el request con Zod, envuelve el valor de retorno en `{ ok: true }` y traduce cualquier excepción a `{ ok: false }`.

**Adentro del main se sigue lanzando.** Los servicios y los guards lanzan `PasteCodeError`, que es el estilo que la convención de seguridad ya documenta. `registerHandler` es la frontera donde eso se convierte en dato. Un `PasteCodeError` viaja como su `code` y su `userMessage`; **cualquier otra cosa** —un `ZodError` porque el renderer mandó basura, un `TypeError` porque tenemos un bug— se loguea entera en el main y cruza como un `UNEXPECTED_ERROR` opaco.

## Alternativas consideradas

| Opción                                                            | Pros                                                                                                         | Contras                                                                                                                                                                                                            | Por qué no                                                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| **Dejar que el handler lance**                                    | Cero código de infraestructura; es el default de Electron                                                    | El `code` y el `userMessage` no cruzan. El renderer recibe una cadena en inglés que no puede mostrar ni interpretar. Además fuerza un `try/catch` en cada llamada del renderer                                     | Es el problema que este ADR existe para resolver                                               |
| **`Result` en cada entrada de `IpcChannels`**                     | Explícito canal por canal; permitiría canales que "no pueden fallar"                                         | Cuarenta oportunidades de olvidarse. Y ningún canal que toca el disco "no puede fallar": el que hoy parece infalible mañana valida algo                                                                            | La uniformidad vale más que la flexibilidad acá                                                |
| **Serializar el error entero, con `message` y stack**             | Debugging cómodo desde las DevTools del renderer                                                             | Manda rutas del disco y detalles del entorno a la capa de la que hay que defenderse, y hace fácil que alguien muestre el `message` técnico en la UI violando RNF-25                                                | El log del main es el lugar del stack. El renderer recibe lo mínimo que necesita               |
| **`Result` también adentro del main** ✅ (parcial)                | Coherencia total con la regla 3 de la convención de código                                                   | Cada capa del main tendría que desarmar y rearmar el `Result` de la de abajo; `resolveInsideWorkspace` pasaría de una línea a cinco en cada uso, y la convención de seguridad documenta esos guards como `@throws` | Se adopta en el límite, que es donde el problema existe, y no adentro, donde sólo agrega ruido |
| **Elegida: `IpcResult` en `PasteCodeApi` + `registerHandler`** ✅ | Un solo lugar donde se decide; imposible olvidarse; el renderer está obligado por el tipo a manejar el error | Todo canal, incluso `app:getVersion`, obliga a chequear `result.ok`                                                                                                                                                | —                                                                                              |

## Consecuencias

- ✅ El renderer está **obligado por el tipo** a manejar el caso de error antes de tocar `value`. No hay forma de ignorarlo sin que TypeScript se queje.
- ✅ El `userMessage` que se muestra en pantalla lo escribe quien define el error, en el mismo lugar donde entiende qué salió mal. RNF-25 deja de depender de que cada `catch` se acuerde.
- ✅ La validación Zod y el logging quedan en un solo lugar. Un canal nuevo no puede saltearse ninguno de los dos: no hay forma de registrarlo sin pasar por `registerHandler`.
- ✅ Un `throw` que escape sigue siendo visible —como `UNEXPECTED_ERROR` en la UI y con el stack completo en el log— en vez de tumbar el proceso o quedar en silencio.
- ⚠️ Hay dos estilos de manejo de errores en el repo: `Result` en el límite de IPC, excepciones adentro del main. La frontera es exactamente `registerHandler`, y está en un solo archivo.
- ⚠️ Cada llamada del renderer necesita su `if (!result.ok)`. Es el costo de que el compilador no deje pasar el caso de error.
- ❌ Se cierra la puerta a que el renderer vea el stack de un error del main. Debuguear un handler es leer el log del main, no las DevTools.
