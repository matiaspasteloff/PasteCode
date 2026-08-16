import type { Terminal } from '@xterm/xterm';

/**
 * Las instancias vivas de xterm, por sesión.
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
 * Registra la instancia de una sesión.
 *
 * @param sessionId Sesión a la que pertenece.
 * @param terminal La instancia recién creada.
 * @example
 * registerTerminal('terminal-1', terminal);
 */
export function registerTerminal(sessionId: string, terminal: Terminal): void {
  instances.set(sessionId, terminal);
}

/**
 * Saca una instancia del registro. La llama el cleanup del efecto que la montó.
 *
 * @param sessionId Sesión que se desmonta.
 * @example
 * releaseTerminal('terminal-1');
 */
export function releaseTerminal(sessionId: string): void {
  instances.delete(sessionId);
}

/**
 * La instancia de una sesión, si sigue montada.
 *
 * @param sessionId Sesión buscada.
 * @returns La instancia, o `undefined` si la sesión murió o nunca existió.
 * @example
 * getTerminal(activeSessionId)?.getSelection();
 */
export function getTerminal(sessionId: string | null): Terminal | undefined {
  return sessionId === null ? undefined : instances.get(sessionId);
}
