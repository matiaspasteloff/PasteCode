import type { FileIconKind } from '@pastecode/core';
import { fileIconFor } from '@pastecode/core';

import type { IconProps } from './Icon.js';
import { IconRoot } from './Icon.js';

/**
 * Los trazos que distinguen a cada familia, adentro de la misma hoja.
 *
 * Es un dibujo por familia y no uno por lenguaje, y el color sale de un token
 * por familia: ver [`fileIconFor`](../../../../../../packages/core/src/workspace/file-icons.ts).
 * El glifo es siempre una hoja de papel con una marca distinta adentro, así
 * que el árbol sigue leyéndose como una lista de archivos y no como una grilla
 * de logos.
 */
const MARKS: Record<FileIconKind, React.JSX.Element | null> = {
  code: <path d="M6.5 7 5 8.75l1.5 1.75M9.5 7 11 8.75l-1.5 1.75" />,
  markup: <path d="M5.5 7.5h5M5.5 10h3" />,
  style: <path d="M8 6.75v4M6.25 8.75h3.5" />,
  data: <path d="M5.75 7.5h4.5M5.75 9.25h4.5M5.75 11h2.5" />,
  doc: <path d="M5.75 7.5h4.5M5.75 9.5h4.5M5.75 11.5h2.5" />,
  config: <circle cx="8" cy="9" r="1.75" />,
  image: <path d="M5.5 11.5 7.25 9l1.5 1.75L10 9.5l1 2z" />,
  default: null,
};

/**
 * El icono de un archivo, elegido por su nombre.
 *
 * Toma el nombre y no la familia ya resuelta porque quien lo usa es una fila
 * del árbol o de una lista, y ninguna de las dos tiene por qué conocer las
 * ocho familias: eso es una decisión de `packages/core` y este componente es
 * el único lugar del renderer que la traduce a color.
 *
 * @param props Nombre del archivo, tamaño y clase.
 * @returns El icono, con la clase de color de su familia.
 * @example
 * <IconFile name="App.tsx" />
 */
export function IconFile({
  name,
  ...props
}: Omit<IconProps, 'className'> & { readonly name: string }): React.JSX.Element {
  const kind = fileIconFor(name);

  return (
    <IconRoot {...props} className={`icon-file icon-file--${kind}`}>
      <path d="M9.5 1.5H4.5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V4.5z" />
      <path d="M9.5 1.5v3h3" />
      {MARKS[kind]}
    </IconRoot>
  );
}
