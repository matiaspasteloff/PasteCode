/**
 * Lo que devuelve todo registro, para poder darlo de baja.
 *
 * `dispose` es asincrónico como todo lo demás de esta API: dar de baja un
 * comando o un ítem de la status bar es un salto de proceso hasta el main, y
 * un `void` acá sería mentir sobre cuándo terminó.
 *
 * **No hay `context.subscriptions`.** En VS Code hace falta porque el host no
 * sabe qué registró cada extensión; acá el main brokerea *todas* las llamadas,
 * así que ya tiene esa atribución y da de baja lo de una extensión que se
 * descarga sin que la extensión colabore. Un `Disposable` sirve para soltar
 * algo antes de tiempo, no para poder apagar la luz al salir.
 */
export interface Disposable {
  dispose(): Promise<void>;
}
