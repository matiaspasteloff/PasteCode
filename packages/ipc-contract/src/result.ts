/**
 * Error tal como cruza el límite de IPC.
 *
 * No es un `Error`: las instancias de `Error` que Electron serializa entre
 * procesos llegan al renderer como un `Error` genérico con el mensaje
 * prefijado y sin ninguna de las propiedades propias, así que un
 * `PasteCodeError` lanzado en el main pierde exactamente lo que lo hace útil
 * —`code` y `userMessage`— justo al cruzar. Esta forma plana es lo que
 * sobrevive al `structuredClone` que hace `ipcRenderer.invoke`.
 *
 * Ver docs/adr/0011-resultado-tipado-en-el-limite-de-ipc.md.
 */
export interface SerializedError {
  /** Código estable de `PasteCodeError`. Ej: `'PATH_OUTSIDE_WORKSPACE'`. */
  code: string;
  /**
   * Mensaje legible por un humano. Es lo único que la UI tiene permitido
   * mostrar ([RNF-25](../../../docs/04-requerimientos-no-funcionales.md)).
   */
  userMessage: string;
}

/**
 * Respuesta de todo canal de IPC.
 *
 * La convención de código manda devolver los errores esperables en vez de
 * lanzarlos (regla 3), y en el IPC eso deja de ser una preferencia de estilo:
 * un `throw` en el handler llega al otro lado como una excepción sin tipo, y
 * el renderer no tiene forma de distinguir "el archivo es binario" de "el
 * handler tiene un bug".
 *
 * @example
 * const result = await window.pastecode.invoke('fs:readFile', { path });
 * if (!result.ok) return showError(result.error.userMessage);
 * editor.setValue(result.value.content);
 */
export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: SerializedError };
