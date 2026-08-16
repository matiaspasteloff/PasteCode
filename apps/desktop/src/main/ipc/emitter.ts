import type { EventName, EventPayload } from '@pastecode/ipc-contract';

/**
 * Lo único que `emit` necesita de una ventana.
 *
 * `BrowserWindow` lo cumple estructuralmente. Pedir la interfaz mínima y no la
 * clase de Electron es lo que deja testear el emisor en Node, sin levantar una
 * app: es la misma razón por la que `createInvocation` está separado de
 * `registerHandler`.
 */
export interface EventRecipient {
  isDestroyed(): boolean;
  webContents: {
    isDestroyed(): boolean;
    send(channel: string, payload: unknown): void;
  };
}

/**
 * Empuja un evento del main al renderer de una ventana.
 *
 * Es el espejo de `registerHandler`: un único lugar donde se decide cómo viaja
 * un evento, para que agregar el segundo no sea copiar y pegar el primero. Ver
 * [ADR-0013](../../../../../docs/adr/0013-eventos-tipados-en-el-ipc.md).
 *
 * **Ignora las ventanas destruidas en vez de lanzar.** Un PTY que escupe la
 * última línea mientras la ventana se cierra es lo normal, no un bug: entre que
 * el usuario aprieta la X y que el proceso hijo muere pasan milisegundos en los
 * que el supervisor sigue teniendo datos para entregar. Si esto lanzara, cada
 * emisor tendría que envolverse en un try/catch, y el que se olvide se lleva
 * una excepción sin atrapar durante el cierre.
 *
 * @param recipient Ventana destino. Normalmente la principal.
 * @param event Nombre del contrato.
 * @param payload Datos del evento. Tienen que sobrevivir a `structuredClone`.
 * @example
 * emit(window, 'terminal:data', { sessionId: 'a', chunk: 'hola\r\n' });
 */
export function emit<E extends EventName>(
  recipient: EventRecipient,
  event: E,
  payload: EventPayload<E>
): void {
  // Las dos comprobaciones son distintas y hacen falta las dos: la ventana
  // puede seguir viva con su webContents ya liberado durante el cierre.
  if (recipient.isDestroyed() || recipient.webContents.isDestroyed()) return;

  recipient.webContents.send(event, payload);
}
