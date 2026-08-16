/**
 * Verifica los contrastes de RNF-22 sobre `tokens.css`, en los dos temas.
 *
 * Hasta la Etapa 4 el cumplimiento de RNF-22 era **un comentario arriba del
 * archivo de tokens**, que es exactamente tan fuerte como la última vez que
 * alguien se acordó de recalcular a mano. Esto lo convierte en un build que
 * falla: corre en `pnpm check`, así que un color que no pasa no llega a `main`.
 *
 * Lo que hace, en orden:
 *
 * 1. Lee `tokens.css` y saca los tres bloques de declaraciones.
 * 2. Verifica que los tres declaren **el mismo conjunto de claves**. Un token
 *    que existe en un tema y no en el otro es un componente que se pinta
 *    transparente en uno de los dos, y eso no lo caza ningún cálculo de
 *    contraste.
 * 3. Resuelve los alias `var(--otro-token)`.
 * 4. Calcula el contraste WCAG de los pares documentados abajo, en los dos
 *    temas, y falla con el detalle de cada par que no llega.
 *
 * No es un motor de CSS: entiende hexadecimales y un nivel de `var()`, que es
 * todo lo que `tokens.css` usa. Si algún día hiciera falta más, lo que
 * corresponde es simplificar el archivo de tokens y no complicar esto.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKENS = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'apps',
  'desktop',
  'src',
  'renderer',
  'styles',
  'tokens.css'
);

/**
 * Los pares que se verifican.
 *
 * `min` es 4.5 para todo lo que se lee como texto y 3 para lo que no: el anillo
 * de foco, los iconos del árbol y las marcas del gutter son indicadores
 * gráficos, y WCAG 1.4.11 les pide 3:1.
 *
 * Los `-subtle` **no** están: son fondos de realce y nunca se usan de color de
 * letra, así que medirlos como texto sería inventar un requisito.
 *
 * Los bordes tampoco: un borde de separación no transmite información por sí
 * mismo —siempre hay un cambio de superficie al lado— y exigirle 3:1 forzaría
 * una línea dura alrededor de cada panel, que es peor de mirar y no más
 * accesible.
 */
const PAIRS = [
  { fg: 'foreground', bg: 'background', min: 4.5 },
  { fg: 'foreground', bg: 'surface', min: 4.5 },
  { fg: 'foreground', bg: 'surface-raised', min: 4.5 },
  { fg: 'foreground', bg: 'surface-sunken', min: 4.5 },
  { fg: 'foreground', bg: 'selection', min: 4.5 },
  { fg: 'muted', bg: 'background', min: 4.5 },
  { fg: 'muted', bg: 'surface', min: 4.5 },
  { fg: 'muted', bg: 'surface-raised', min: 4.5 },
  { fg: 'accent', bg: 'background', min: 4.5 },
  { fg: 'accent', bg: 'surface', min: 4.5 },
  { fg: 'accent-contrast', bg: 'accent', min: 4.5 },
  { fg: 'danger', bg: 'background', min: 4.5 },
  { fg: 'danger', bg: 'surface', min: 4.5 },
  { fg: 'warning', bg: 'background', min: 4.5 },
  { fg: 'warning', bg: 'surface', min: 4.5 },
  { fg: 'success', bg: 'background', min: 4.5 },
  { fg: 'success', bg: 'surface', min: 4.5 },
  { fg: 'info', bg: 'background', min: 4.5 },
  { fg: 'info', bg: 'surface', min: 4.5 },
  // Los estados de Git tiñen **el nombre del archivo** en el árbol, así que se
  // leen como texto y van a 4.5 contra la superficie de la barra lateral.
  { fg: 'git-added', bg: 'surface', min: 4.5 },
  { fg: 'git-modified', bg: 'surface', min: 4.5 },
  { fg: 'git-deleted', bg: 'surface', min: 4.5 },
  { fg: 'git-untracked', bg: 'surface', min: 4.5 },
  { fg: 'git-conflict', bg: 'surface', min: 4.5 },
  // El anillo de foco y los iconos son gráficos: 3:1 (WCAG 1.4.11).
  { fg: 'focus-ring', bg: 'background', min: 3 },
  { fg: 'focus-ring', bg: 'surface', min: 3 },
  { fg: 'icon-code', bg: 'surface', min: 3 },
  { fg: 'icon-markup', bg: 'surface', min: 3 },
  { fg: 'icon-style', bg: 'surface', min: 3 },
  { fg: 'icon-data', bg: 'surface', min: 3 },
  { fg: 'icon-doc', bg: 'surface', min: 3 },
  { fg: 'icon-config', bg: 'surface', min: 3 },
  { fg: 'icon-image', bg: 'surface', min: 3 },
  { fg: 'icon-default', bg: 'surface', min: 3 },
];

/** Saca las declaraciones `--x: y;` del bloque que arranca en `openBrace`. */
function declarationsFrom(css, openBrace) {
  let depth = 0;
  let end = openBrace;

  for (let index = openBrace; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    if (css[index] === '}') {
      depth -= 1;

      if (depth === 0) {
        end = index;
        break;
      }
    }
  }

  const body = css.slice(openBrace + 1, end);
  const declarations = new Map();

  for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    declarations.set(name, value.trim());
  }

  return declarations;
}

/**
 * Ubica un bloque por su selector y devuelve sus declaraciones.
 *
 * La llave se busca **desde el principio del selector** y no desde su final: el
 * selector del tema claro es `:root {`, llave incluida, así que arrancar la
 * búsqueda después de él se saltea su propia llave y engancha la del bloque
 * siguiente. El síntoma es peor que un error: el script mide el tema oscuro dos
 * veces, nunca mira el claro y da verde con un color que no contrasta.
 */
function blockOf(css, selector) {
  const at = css.indexOf(selector);

  if (at === -1) throw new Error(`No se encontró el bloque "${selector}" en tokens.css`);

  return declarationsFrom(css, css.indexOf('{', at));
}

/** Resuelve `var(--otro)` hasta llegar a un valor literal. */
function resolve(declarations, name) {
  let value = declarations.get(name);

  for (let hops = 0; hops < 8 && value !== undefined; hops += 1) {
    const alias = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value);

    if (alias === null) return value;

    value = declarations.get(alias[1]);
  }

  return value;
}

/** Canal sRGB a lineal, como define WCAG 2.x. */
function linearize(channel) {
  const ratio = channel / 255;

  return ratio <= 0.04045 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

/** Luminancia relativa de un `#rrggbb`. */
function luminance(hex) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);

  if (match === null) throw new Error(`No es un color hexadecimal de seis dígitos: "${hex}"`);

  const value = Number.parseInt(match[1], 16);
  const red = linearize((value >> 16) & 0xff);
  const green = linearize((value >> 8) & 0xff);
  const blue = linearize(value & 0xff);

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** El contraste WCAG entre dos colores, entre 1 y 21. */
function contrast(first, second) {
  const one = luminance(first);
  const other = luminance(second);

  return (Math.max(one, other) + 0.05) / (Math.min(one, other) + 0.05);
}

/** Verifica un tema y devuelve las líneas de las fallas que encontró. */
function checkTheme(themeName, declarations) {
  const failures = [];

  for (const { fg, bg, min } of PAIRS) {
    const foreground = resolve(declarations, `--color-${fg}`);
    const background = resolve(declarations, `--color-${bg}`);

    if (foreground === undefined || background === undefined) {
      failures.push(`${themeName}: falta --color-${fg} o --color-${bg}`);
      continue;
    }

    const ratio = contrast(foreground, background);

    if (ratio < min) {
      failures.push(
        `${themeName}: ${fg} sobre ${bg} da ${ratio.toFixed(2)}:1 y necesita ${min}:1` +
          ` (${foreground} sobre ${background})`
      );
    }
  }

  return failures;
}

/** Verifica que los tres bloques declaren el mismo conjunto de claves de color. */
function checkSameKeys(blocks) {
  const failures = [];
  const [reference] = blocks;
  const expected = [...reference.declarations.keys()].filter((key) =>
    key.startsWith('--color-')
  );

  for (const { name, declarations } of blocks.slice(1)) {
    const present = new Set(
      [...declarations.keys()].filter((key) => key.startsWith('--color-'))
    );
    const missing = expected.filter((key) => !present.has(key));
    const extra = [...present].filter((key) => !expected.includes(key));

    for (const key of missing) failures.push(`${name}: falta ${key}, que sí define el claro`);
    for (const key of extra) failures.push(`${name}: define ${key}, que el claro no tiene`);
  }

  return failures;
}

const css = (await readFile(TOKENS, 'utf8')).replaceAll(/\/\*[\s\S]*?\*\//g, '');

const light = blockOf(css, ':root {');
const systemDark = blockOf(css, ":root:not([data-theme='light'])");
const explicitDark = blockOf(css, ":root[data-theme='dark']");

// El bloque oscuro sólo redefine colores: hereda del claro la tipografía, las
// escalas y la geometría. Se mezcla para poder resolver alias que apunten a un
// token que el bloque oscuro no repite.
const dark = new Map([...light, ...explicitDark]);

const failures = [
  ...checkSameKeys([
    { name: 'claro', declarations: light },
    { name: 'oscuro del sistema', declarations: systemDark },
    { name: 'oscuro explícito', declarations: explicitDark },
  ]),
  ...checkTheme('claro', light),
  ...checkTheme('oscuro', dark),
];

if (failures.length > 0) {
  console.error(`RNF-22: ${failures.length} par(es) no cumplen el contraste mínimo.\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `RNF-22 en verde: ${PAIRS.length} pares verificados en los dos temas, ` +
    `y los tres bloques declaran los mismos ${light.size} tokens.`
);
