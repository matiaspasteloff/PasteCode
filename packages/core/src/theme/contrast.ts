/** Un color, como los tres canales de 0 a 255. */
interface Channels {
  red: number;
  green: number;
  blue: number;
}

/**
 * Parsea un `#rrggbb`.
 *
 * @param hex El color, con el `#` y seis dígitos.
 * @returns Los tres canales.
 * @throws {Error} Si no tiene la forma esperada. Un color mal escrito en un
 *   tema es un bug del tema, y fallar acá lo pone en la salida del test en vez
 *   de dejar un componente pintado de negro.
 * @example
 * parseHex('#ff8800'); // { red: 255, green: 136, blue: 0 }
 */
export function parseHex(hex: string): Channels {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);

  if (match === null) throw new Error(`No es un color hexadecimal de seis dígitos: "${hex}"`);

  const value = Number.parseInt(match[1] ?? '', 16);

  return { red: (value >> 16) & 0xff, green: (value >> 8) & 0xff, blue: value & 0xff };
}

/** Los tres canales, de vuelta a `#rrggbb`. */
function toHex({ red, green, blue }: Channels): string {
  const channel = (value: number): string => Math.round(value).toString(16).padStart(2, '0');

  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

/** Canal sRGB a lineal, como define WCAG 2.x. */
function linearize(channel: number): number {
  const ratio = channel / 255;

  return ratio <= 0.04045 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

/**
 * La luminancia relativa de un color, entre 0 y 1.
 *
 * @param hex El color.
 * @returns La luminancia.
 * @example
 * relativeLuminance('#ffffff'); // 1
 */
export function relativeLuminance(hex: string): number {
  const { red, green, blue } = parseHex(hex);

  return 0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue);
}

/**
 * El contraste WCAG entre dos colores, entre 1 y 21.
 *
 * Vive en `packages/core` y no sólo en `scripts/check-contrast.mjs` porque
 * ahora hay dos cosas que verificar: los tokens de `tokens.css`, que son un
 * archivo de CSS y los mide el script, y los nueve temas incorporados de
 * [ADR-0031](../../../../docs/adr/0031-temas-incorporados-como-datos.md), que
 * son **datos de TypeScript** y los mide un test. Tener la fórmula dos veces
 * sería tener dos umbrales que se pueden contradecir.
 *
 * @param first Un color.
 * @param second El otro.
 * @returns La razón de contraste.
 * @example
 * contrastRatio('#000000', '#ffffff'); // 21
 */
export function contrastRatio(first: string, second: string): number {
  const one = relativeLuminance(first);
  const other = relativeLuminance(second);

  return (Math.max(one, other) + 0.05) / (Math.min(one, other) + 0.05);
}

/**
 * Mezcla dos colores.
 *
 * Es lo que genera los fondos `-subtle` de cada tema a partir de su color
 * semántico y su fondo, en vez de pedirle a cada paleta cuatro colores más que
 * nadie va a elegir a mano. Un `danger-subtle` derivado siempre armoniza con
 * su tema; uno escrito a ojo, nueve veces, no.
 *
 * @param color El color que tiñe.
 * @param background Sobre qué se lo mezcla.
 * @param amount Cuánto del primero, de 0 a 1.
 * @returns El color mezclado.
 * @example
 * blend('#ff0000', '#ffffff', 0.1); // '#ffe6e6'
 */
export function blend(color: string, background: string, amount: number): string {
  const front = parseHex(color);
  const back = parseHex(background);
  const mix = (one: number, other: number): number => other + (one - other) * amount;

  return toHex({
    red: mix(front.red, back.red),
    green: mix(front.green, back.green),
    blue: mix(front.blue, back.blue),
  });
}
