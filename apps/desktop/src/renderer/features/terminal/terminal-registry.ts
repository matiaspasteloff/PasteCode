import type { Terminal } from '@xterm/xterm';

/**
 * Las instancias vivas de xterm, por **slot** y no por sesión.
 *
 * La clave es el id local del slot porque xterm existe **antes** que el
 * proceso: se lo monta, se lo mide, y recién con esas columnas y filas se pide
 * el PTY. Con el id de sesión como clave, la instancia no se podría registrar
 * hasta después de un viaje de IPC — y es justamente en ese intervalo cuando
 * hay que medirla.
 *
 * Existe por la misma razón que el `EditorModelRegistry` de Monaco: hay
 * comandos —copiar y pegar, [RF-304](../../../../../docs/03-requerimientos-funcionales.md#terminal-integrada)—
 * que necesitan hablarle a la instancia de la terminal activa, y esos comandos
 * se registran en el arranque de la app, muy lejos del componente que la montó.
 * Pasarla por props significaría que la paleta de comandos conozca al panel de
 * terminales, que es exactamente el acoplamiento que el registro de comandos
 * existe para no tener.
 */
const instances = new Map<string, Terminal>();

/**
 * Registra la instancia de una terminal.
 *
 * @param slotId Terminal a la que pertenece.
 * @param terminal La instancia recién creada.
 * @example
 * registerTerminal(slot.slotId, terminal);
 */
export function registerTerminal(slotId: string, terminal: Terminal): void {
  instances.set(slotId, terminal);
}

/**
 * Saca una instancia del registro. La llama el cleanup del efecto que la montó.
 *
 * @param slotId Terminal que se desmonta.
 * @example
 * releaseTerminal(slot.slotId);
 */
export function releaseTerminal(slotId: string): void {
  instances.delete(slotId);
}

/**
 * La instancia de una terminal, si sigue montada.
 *
 * @param slotId Terminal buscada.
 * @returns La instancia, o `undefined` si la terminal se cerró o nunca existió.
 * @example
 * getTerminal(activeSlotId)?.getSelection();
 */
export function getTerminal(slotId: string | null): Terminal | undefined {
  return slotId === null ? undefined : instances.get(slotId);
}
