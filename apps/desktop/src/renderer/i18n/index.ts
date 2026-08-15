import { es } from './es.js';

/** Toda clave válida del diccionario. Cualquier otra cosa no compila. */
export type TranslationKey = keyof typeof es;

/**
 * Traduce una clave del diccionario.
 *
 * Es deliberadamente mínimo. El [DoD](../../../../../docs/convenciones/definition-of-done.md)
 * prohíbe strings hardcodeados en la UI y
 * [RNF-29](../../../../../docs/04-requerimientos-no-funcionales.md#compatibilidad)
 * pide que la app sea traducible, pero con un solo idioma activo y unas
 * decenas de strings, una librería de i18n sería peso muerto: no hace falta
 * carga perezosa de bundles, ni negociación de locale, ni pluralización.
 *
 * Lo que sí hace falta es que una clave mal escrita no llegue a producción, y
 * eso lo da el tipo. Cuando aparezca el segundo idioma o la primera regla de
 * plural, esto se reemplaza — y el punto es que se reemplaza en un solo lugar.
 *
 * @param key Clave del diccionario.
 * @returns El texto en español.
 * @example
 * t('workspace.open'); // 'Abrir carpeta'
 */
export function t(key: TranslationKey): string {
  return es[key];
}
