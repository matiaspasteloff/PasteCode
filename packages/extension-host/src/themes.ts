import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ThemeColorToken, TokenColorRule } from '@pastecode/extension-api';

import type { DiscoveredExtension } from './scan.js';

/** Un tema listo para aplicar, con su JSON ya leído. */
export interface LoadedTheme {
  /** Único en todo el IDE. Es lo que nombra `window.colorTheme`. */
  id: string;
  label: string;
  /** Contra qué base se dibuja lo que el tema no pisa. */
  uiTheme: 'light' | 'dark';
  /** Quién lo aporta, para poder sacarlo cuando se descargue. */
  extension: string;
  colors: Partial<Record<ThemeColorToken, string>>;
  tokenColors: TokenColorRule[];
}

/**
 * Lee los temas que aportan las extensiones encontradas.
 *
 * Se leen **al escanear y no al activar**: un tema es un archivo de datos y su
 * extensión puede no tener código, así que esperar a una activación que nunca
 * va a ocurrir dejaría el tema invisible. Es la misma razón por la que `main`
 * es opcional en el manifest.
 *
 * Un tema que no se puede leer se saltea en silencio en vez de tumbar la carga.
 * El manifest ya se validó; lo que falla acá es el archivo al que apunta, y una
 * extensión con tres temas de los cuales uno está roto tiene que aportar los
 * otros dos.
 *
 * @param found Las extensiones cuyo manifest ya se validó.
 * @returns Los temas leídos, en el orden en que aparecieron.
 * @example
 * const themes = await readThemes(scanned.extensions);
 */
export async function readThemes(
  found: readonly DiscoveredExtension[]
): Promise<LoadedTheme[]> {
  const themes: LoadedTheme[] = [];

  for (const extension of found) {
    for (const contribution of extension.manifest.contributes?.themes ?? []) {
      const loaded = await readTheme(extension, contribution);

      if (loaded !== null) themes.push(loaded);
    }
  }

  return themes;
}

/** Lee un tema suelto, o `null` si su archivo no sirve. */
async function readTheme(
  extension: DiscoveredExtension,
  contribution: { id: string; label: string; uiTheme: 'light' | 'dark'; path: string }
): Promise<LoadedTheme | null> {
  const raw = await readFile(join(extension.root, contribution.path), 'utf8').catch(() => null);

  if (raw === null) return null;

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  return {
    id: contribution.id,
    label: contribution.label,
    uiTheme: contribution.uiTheme,
    extension: extension.manifest.name,
    colors: readColors(parsed),
    tokenColors: readTokenColors(parsed),
  };
}

/**
 * Los colores del JSON, quedándose sólo con los que son hex de verdad.
 *
 * Se filtra en vez de validar el objeto entero porque un color de más —de una
 * versión del IDE que todavía no salió, o de un token que se renombró— no tiene
 * por qué invalidar el tema. Lo que no se entiende se ignora, y lo que se
 * entiende se aplica.
 */
function readColors(parsed: unknown): Partial<Record<ThemeColorToken, string>> {
  const colors = readField(parsed, 'colors');

  if (typeof colors !== 'object' || colors === null) return {};

  const result: Partial<Record<ThemeColorToken, string>> = {};

  for (const [token, value] of Object.entries(colors)) {
    if (typeof value === 'string' && HEX_COLOR.test(value)) {
      // El token se acepta tal como viene: la lista de válidos la tiene el
      // renderer, que es quien los escribe como variables CSS, y un token que
      // no existe simplemente no pinta nada.
      Object.defineProperty(result, token, { value, enumerable: true });
    }
  }

  return result;
}

/**
 * Hex de tres, seis u ocho dígitos.
 *
 * Se valida acá y no en el renderer porque es lo que impide que un tema
 * inyecte una declaración CSS arbitraria: sin esto, un `color` con el valor
 * `red; position: fixed; top: 0` se escribiría tal cual en el `style` del
 * documento. Es el mismo criterio de RNF-13 aplicado a datos de terceros.
 */
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Las reglas de tokenización, salteando las que no tienen forma de regla. */
function readTokenColors(parsed: unknown): TokenColorRule[] {
  const rules = readField(parsed, 'tokenColors');

  if (!Array.isArray(rules)) return [];

  return rules.flatMap((rule: unknown) => {
    const token = readField(rule, 'token');
    const foreground = readField(rule, 'foreground');
    const fontStyle = readField(rule, 'fontStyle');

    if (typeof token !== 'string') return [];
    if (
      foreground !== undefined &&
      (typeof foreground !== 'string' || !HEX_COLOR.test(foreground))
    )
      return [];

    return [
      {
        token,
        ...(typeof foreground === 'string' ? { foreground } : {}),
        ...(typeof fontStyle === 'string' ? { fontStyle } : {}),
      },
    ];
  });
}

/** Saca un campo sin asumir que el contenedor sea un objeto. */
function readField(value: unknown, field: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;

  return Reflect.get(value, field);
}
