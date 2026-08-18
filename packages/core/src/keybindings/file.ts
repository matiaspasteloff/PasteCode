import { z } from 'zod';

import type { Keybinding } from './resolver.js';

/**
 * Un atajo tal como se escribe en `keybindings.json`.
 *
 * `strictObject` como el resto de los schemas del proyecto: una clave de más es
 * casi siempre un error de tipeo —`comand` en vez de `command`— y aceptarla en
 * silencio deja a alguien mirando por qué su atajo no hace nada.
 */
const KeybindingEntrySchema = z.strictObject({
  /** La combinación. Se normaliza al cargar, así que `Ctrl+K` también vale. */
  key: z.string().min(1),
  command: z.string().min(1),
  when: z.string().min(1).optional(),
});

/**
 * El archivo entero: una lista de atajos.
 *
 * Una lista pelada y no un objeto con `version` como `settings.json`, y la
 * asimetría es a propósito. Las settings son un diccionario de claves conocidas
 * que va a crecer y va a necesitar migraciones; esto es una lista de reglas del
 * usuario cuya forma —tecla, comando, condición— no tiene por qué cambiar. Es
 * además el formato que ya conoce cualquiera que usó VS Code.
 */
export const KeybindingsFileSchema = z.array(KeybindingEntrySchema);

/** El contenido válido de un `keybindings.json`. */
export type KeybindingsFile = z.infer<typeof KeybindingsFileSchema>;

/**
 * Normaliza una combinación al formato del resolver.
 *
 * El resolver compara `key` por igualdad contra lo que produce
 * `toKeyCombination`, que es todo en minúsculas y con los modificadores en
 * orden fijo. Sin esto, un `keybindings.json` con `Ctrl+Shift+P` —que es como
 * lo escribe cualquiera— no dispararía nunca y no habría ningún error que
 * mirar.
 *
 * El orden de los modificadores se fija acá y no se respeta el del archivo:
 * `shift+ctrl+p` y `ctrl+shift+p` son la misma tecla para quien la aprieta.
 *
 * @param key La combinación como la escribió el usuario.
 * @returns La combinación normalizada.
 * @example
 * normalizeKey('Shift+Ctrl+P'); // 'ctrl+shift+p'
 * normalizeKey('Ctrl+Alt+Shift+K'); // 'ctrl+shift+alt+k'
 */
export function normalizeKey(key: string): string {
  const parts = key
    .toLowerCase()
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part !== '');

  const modifiers = MODIFIER_ORDER.filter((modifier) => parts.includes(modifier));
  const rest = parts.filter((part) => !MODIFIER_ORDER.includes(part));

  return [...modifiers, ...rest].join('+');
}

/**
 * El orden en que se escriben los modificadores.
 *
 * Es exactamente el que produce `toKeyCombination` en el renderer
 * —`ctrl+shift+alt+meta`—. Los dos tienen que coincidir: el resolver compara
 * las teclas por igualdad de cadena, así que un orden distinto acá no da un
 * error, da un atajo que no dispara nunca.
 */
const MODIFIER_ORDER: readonly string[] = ['ctrl', 'shift', 'alt', 'meta'];

/**
 * Los atajos del archivo, ya con las teclas normalizadas.
 *
 * @param file El archivo ya validado por el schema.
 * @returns Los atajos listos para el resolver.
 * @example
 * userKeybindings([{ key: 'Ctrl+K', command: 'file.save' }]);
 */
export function userKeybindings(file: KeybindingsFile): Keybinding[] {
  return file.map((entry) => {
    const binding: Keybinding = { key: normalizeKey(entry.key), command: entry.command };

    // El `when` se agrega sólo si vino. Con `exactOptionalPropertyTypes`, un
    // `when: undefined` explícito **no** es lo mismo que no tener la propiedad,
    // y `Keybinding.when` está declarado como opcional y no como
    // `string | undefined`.
    return entry.when === undefined ? binding : { ...binding, when: entry.when };
  });
}
