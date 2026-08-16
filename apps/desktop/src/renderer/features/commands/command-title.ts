import type { Command } from '@pastecode/core';

import { isTranslationKey, t } from '../../i18n/index.js';

/**
 * El título traducido de un comando, o la clave misma si no está en el
 * diccionario.
 *
 * El caso del `else` no es teórico: desde la Etapa 5 los comandos pueden venir
 * de extensiones, con títulos que nuestro diccionario no conoce. Mostrar la
 * clave cruda es feo, pero es mejor que no mostrar nada.
 *
 * Vive en su propio archivo desde que la lista de la paleta pasó a ser el
 * `QuickPick` genérico: la función es de los comandos, no del componente.
 *
 * @param command El comando.
 * @returns El texto a mostrar.
 * @example
 * commandTitle({ id: 'file.save', title: 'command.fileSave', handler });
 */
export function commandTitle(command: Command): string {
  return isTranslationKey(command.title) ? t(command.title) : command.title;
}
