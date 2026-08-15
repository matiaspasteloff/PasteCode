import { PasteCodeError } from '@pastecode/core';
import type {
  ChannelName,
  IpcResult,
  Request,
  RequestSchema,
  Response,
  SerializedError,
} from '@pastecode/ipc-contract';
import { ipcMain } from 'electron';

/**
 * Lo que ve el renderer cuando el handler falla por algo que no previmos.
 *
 * Es deliberadamente opaco: el `message` y el stack de un error inesperado
 * pueden contener rutas del disco o fragmentos del entorno, y el renderer es
 * la capa de la que hay que defenderse. El detalle va al log del main.
 */
const UNEXPECTED_ERROR: SerializedError = {
  code: 'UNEXPECTED_ERROR',
  userMessage: 'Algo salió mal. Si vuelve a pasar, revisá el log de la aplicación.',
};

/** Lógica de un canal, tal como se escribe en `apps/desktop/src/main/ipc`. */
type ChannelLogic<C extends ChannelName> = (
  payload: Request<C>
) => Promise<Response<C>> | Response<C>;

/**
 * Arma la función que atiende un canal: valida el request y envuelve la
 * respuesta en `IpcResult`.
 *
 * Está separada de `registerHandler` para que se pueda testear sin un Electron
 * vivo. Lo que queda del otro lado es una línea de cableado, y esa la ejerce
 * el E2E de punta a punta.
 *
 * @param channel Canal del contrato. Sólo se usa para el log.
 * @param schema Schema del request. Estricto, siempre.
 * @param handle Lógica del canal. Puede lanzar `PasteCodeError`.
 * @returns La función que recibe el payload crudo y nunca lanza.
 * @example
 * const invoke = createInvocation('app:getVersion', GetVersionRequestSchema, () => ({
 *   version: '0.1.0',
 * }));
 * await invoke({}); // { ok: true, value: { version: '0.1.0' } }
 */
export function createInvocation<C extends ChannelName>(
  channel: C,
  schema: RequestSchema<C>,
  handle: ChannelLogic<C>
): (raw: unknown) => Promise<IpcResult<Response<C>>> {
  return async (raw: unknown) => {
    try {
      return { ok: true, value: await handle(schema.parse(raw)) };
    } catch (cause) {
      return { ok: false, error: toSerializedError(channel, cause) };
    }
  };
}

/**
 * Registra un handler de IPC con validación de input y errores serializados.
 *
 * Existe para que ni la validación Zod ni el envoltorio en `IpcResult` sean
 * algo que cada canal tenga que acordarse de hacer. Son los dos puntos donde
 * equivocarse una vez se paga cuarenta ([regla 2 de IPC](../../../../../docs/02-arquitectura.md#reglas-de-ipc)),
 * así que se escriben una sola vez, acá.
 *
 * El handler que se pasa **sí puede lanzar**: es el estilo que usa
 * docs/convenciones/seguridad.md para los `assert*`, y encadenar guards se
 * lee mejor que propagar `Result` a mano por cada capa del main. Lo que nunca
 * cruza el IPC es la excepción; de eso se encarga este envoltorio. Ver
 * [ADR-0011](../../../../../docs/adr/0011-resultado-tipado-en-el-limite-de-ipc.md).
 *
 * @param channel Canal del contrato.
 * @param schema Schema del request. Estricto, siempre.
 * @param handle Lógica del canal. Puede lanzar `PasteCodeError`.
 * @example
 * registerHandler('fs:readFile', ReadFileRequestSchema, async (payload) =>
 *   readWorkspaceFile(payload.path)
 * );
 */
export function registerHandler<C extends ChannelName>(
  channel: C,
  schema: RequestSchema<C>,
  handle: ChannelLogic<C>
): void {
  const invocation = createInvocation(channel, schema, handle);

  ipcMain.handle(channel, (_event, raw: unknown) => invocation(raw));
}

/**
 * Traduce lo que sea que se haya lanzado a la forma plana que cruza el IPC.
 *
 * Un `PasteCodeError` ya trae lo que la UI necesita. Cualquier otra cosa
 * —incluido un `ZodError` de un renderer que mandó basura— es un bug o un
 * intento de abuso: se loguea entero y se responde genérico.
 */
function toSerializedError(channel: string, cause: unknown): SerializedError {
  if (cause instanceof PasteCodeError) {
    // El código y el mensaje técnico van al log igual: el userMessage está
    // pensado para orientar a una persona, no para diagnosticar.
    console.error(`[ipc] ${channel} falló con ${cause.code}:`, cause);
    return { code: cause.code, userMessage: cause.userMessage };
  }

  console.error(`[ipc] ${channel} lanzó un error inesperado:`, cause);
  return UNEXPECTED_ERROR;
}
