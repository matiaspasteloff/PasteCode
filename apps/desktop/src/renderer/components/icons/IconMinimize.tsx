import type { IconProps } from './Icon.js';
import { IconRoot } from './Icon.js';

/**
 * Minimizar la ventana. Una raya horizontal a media altura, como la de Windows.
 *
 * @param props Tamaño y clase.
 * @returns El icono.
 * @example
 * <IconMinimize size={10} />
 */
export function IconMinimize(props: IconProps): React.JSX.Element {
  return (
    <IconRoot {...props}>
      <path d="M2 8h12" />
    </IconRoot>
  );
}
