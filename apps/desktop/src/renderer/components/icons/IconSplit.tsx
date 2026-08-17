import type { IconProps } from './Icon.js';
import { IconRoot } from './Icon.js';

/**
 * Un rectángulo partido. El botón de partir el editor.
 *
 * La orientación es una prop y no dos iconos: es el mismo dibujo con la línea
 * girada, y dos archivos para eso serían dos lugares donde arreglar el mismo
 * trazo.
 *
 * @param props Orientación, tamaño y clase.
 * @returns El icono.
 * @example
 * <IconSplit orientation="vertical" size={14} />
 */
export function IconSplit({
  orientation = 'horizontal',
  ...props
}: IconProps & { readonly orientation?: 'horizontal' | 'vertical' }): React.JSX.Element {
  return (
    <IconRoot {...props}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      {orientation === 'horizontal' ? <path d="M8 2.5v11" /> : <path d="M1.5 8h13" />}
    </IconRoot>
  );
}
