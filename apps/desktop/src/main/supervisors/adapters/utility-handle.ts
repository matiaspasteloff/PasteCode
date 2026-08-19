import type { UtilityProcess } from 'electron';

import type { ProcessExit, ProcessHandle } from '../process-handle.js';

/**
 * El extension host visto por el supervisor.
 *
 * Agrega el par `postMessage`/`onMessage` a la interfaz mínima porque un
 * `utilityProcess` no habla por pipes: habla por un `MessagePort`, y el
 * protocolo del host va por ahí. Es la misma razón por la que
 * `ChildProcessHandle` agrega sus dos streams — la diferencia es real, así que
 * vive en el tipo en vez de esconderse detrás de un campo opcional.
 */
export interface UtilityProcessHandle extends ProcessHandle {
  postMessage(message: unknown): void;
  onMessage(listener: (message: unknown) => void): void;
}

/**
 * Envuelve un `utilityProcess` como handle del supervisor.
 *
 * **`terminate` y `forceKill` hacen lo mismo.** Un `utilityProcess` expone un
 * solo `kill()` y no acepta señales, así que no hay dos fases posibles a este
 * nivel. El apagado amable existe igual, pero una capa más arriba: es el
 * `host/shutdown` del protocolo, enchufado en el `requestGracefulExit` de
 * `ManagedProcess`, que es exactamente la costura que ese campo existe para
 * cubrir. Un host matado sin avisar deja las extensiones sin su `deactivate`.
 *
 * @param child El proceso recién forkeado.
 * @returns El handle, con su canal de mensajes.
 * @example
 * const handle = adaptUtilityProcess(utilityProcess.fork(entry));
 */
export function adaptUtilityProcess(child: UtilityProcess): UtilityProcessHandle {
  return {
    /**
     * El pid, leído **cada vez** y no capturado al envolver.
     *
     * Un `utilityProcess` no tiene pid hasta que emite `spawn`, y `fork`
     * devuelve antes de eso. Un `child.pid ?? -1` evaluado acá —que es lo que
     * hace `adaptChildProcess`, donde sí es correcto porque `spawn` de
     * `child_process` asigna el pid sincrónicamente— congelaría el centinela
     * para toda la vida del proceso. El getter lo resuelve cuando alguien
     * pregunta, que es siempre después.
     */
    get pid(): number {
      return child.pid ?? -1;
    },

    postMessage(message) {
      child.postMessage(message);
    },

    onMessage(listener) {
      child.on('message', (message: unknown) => {
        listener(message);
      });
    },

    terminate() {
      child.kill();
    },

    forceKill() {
      child.kill();
    },

    onExit(listener) {
      child.on('exit', (code: number) => {
        // `signal` va siempre en `null`: Electron entrega un código y nada más.
        // Inventar un número sería peor que decir que no se sabe.
        const exit: ProcessExit = { exitCode: code, signal: null };

        listener(exit);
      });
    },
  };
}
