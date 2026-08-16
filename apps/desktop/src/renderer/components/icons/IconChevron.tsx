import type { IconProps } from './Icon.js';
import { IconRoot } from './Icon.js';

/**
 * El triángulo de expandir y contraer.
 *
 * Rota con una transformación en vez de tener dos dibujos: son el mismo glifo
 * en dos orientaciones, y con dos `path` distintos la animación entre estados
 * dejaría de ser posible el día que se quiera.
 *
 * @param props Tamaño, clase y si apunta hacia abajo.
 * @returns El icono.
 * @example
 * <IconChevron isOpen={node.isExpanded} />
 */
export function IconChevron({
  isOpen = false,
  ...props
}: Omit<IconProps, 'className'> & { readonly isOpen?: boolean }): React.JSX.Element {
  return (
    <IconRoot {...props} className={`icon-chevron${isOpen ? ' icon-chevron--open' : ''}`}>
      <path d="M6 3.5 10.5 8 6 12.5" />
    </IconRoot>
  );
}
