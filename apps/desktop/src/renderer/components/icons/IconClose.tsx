import type { IconProps } from './Icon.js';
import { IconRoot } from './Icon.js';

/**
 * Cerrar. Una cruz.
 *
 * @param props Tamaño y clase.
 * @returns El icono.
 * @example
 * <IconClose size={12} />
 */
export function IconClose(props: IconProps): React.JSX.Element {
  return (
    <IconRoot {...props}>
      <path d="M4 4l8 8" />
      <path d="M12 4l-8 8" />
    </IconRoot>
  );
}
