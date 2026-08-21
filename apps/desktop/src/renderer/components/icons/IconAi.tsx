import type { IconProps } from './Icon.js';
import { IconRoot } from './Icon.js';

/**
 * El asistente. Una chispa.
 *
 * Chispa y no un robot ni un cerebro: es el glifo que la convención de la
 * industria ya asoció con "esto lo generó un modelo", y un icono que se
 * reconoce sin leer el tooltip es lo único que se le pide al rail.
 *
 * @param props Tamaño y clase.
 * @returns El icono.
 * @example
 * <IconAi />
 */
export function IconAi(props: IconProps): React.JSX.Element {
  return (
    <IconRoot {...props}>
      <path d="M6.5 1.5 7.8 5.2 11.5 6.5 7.8 7.8 6.5 11.5 5.2 7.8 1.5 6.5 5.2 5.2Z" />
      <path d="M12 9.5 12.6 11.4 14.5 12 12.6 12.6 12 14.5 11.4 12.6 9.5 12 11.4 11.4Z" />
    </IconRoot>
  );
}
