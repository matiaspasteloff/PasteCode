/**
 * Los colores que un tema puede pisar.
 *
 * Son los tokens semánticos de
 * [`tokens.css`](../../../apps/desktop/src/renderer/styles/tokens.css) sin el
 * prefijo `--color-`. Es una unión de literales y no `string` para que un
 * `backgroud` mal tipeado sea un error de compilación y no un color que
 * silenciosamente no se aplica.
 *
 * **Ocho roles de icono, no ochenta lenguajes**, por la misma razón que los
 * tokens: un color por lenguaje es un mapa que nadie mantiene.
 */
export type ThemeColorToken =
  | 'background'
  | 'surface'
  | 'surface-raised'
  | 'surface-sunken'
  | 'border'
  | 'foreground'
  | 'muted'
  | 'accent'
  | 'accent-contrast'
  | 'selection'
  | 'focus-ring'
  | 'danger'
  | 'danger-subtle'
  | 'warning'
  | 'warning-subtle'
  | 'success'
  | 'success-subtle'
  | 'info'
  | 'info-subtle'
  | 'git-added'
  | 'git-modified'
  | 'git-deleted'
  | 'git-untracked'
  | 'git-conflict'
  | 'icon-code'
  | 'icon-markup'
  | 'icon-style'
  | 'icon-data'
  | 'icon-doc'
  | 'icon-config'
  | 'icon-image'
  | 'icon-default';

/**
 * Una regla de tokenización, en el vocabulario de Monaco.
 *
 * `token` es un scope de Monarch —`comment`, `string`, `keyword.control`—, no
 * un scope de TextMate. Monaco no habla TextMate; soportarlo de verdad
 * requiere WASM y una excepción de CSP, y ésa es la deuda que quedó anotada
 * como [RF-113](../../../docs/03-requerimientos-funcionales.md).
 */
export interface TokenColorRule {
  token: string;
  /** Hex de 6 dígitos, con `#`. */
  foreground?: string;
  /** `italic`, `bold`, `underline`, o una combinación separada por espacios. */
  fontStyle?: string;
}

/**
 * El JSON al que apunta `contributes.themes[].path`.
 *
 * `colors` es **parcial** a propósito: un tema hereda del `uiTheme` que declaró
 * todo lo que no pisa. Exigir los treinta y dos tokens haría que cambiar un
 * acento fuera un trabajo de tarde, y que agregar un token nuevo al IDE
 * rompiera todos los temas de terceros que ya existen.
 *
 * **Un tema de terceros no pasa por la compuerta de contraste de
 * [RNF-22](../../../docs/04-requerimientos-no-funcionales.md).**
 * `scripts/check-contrast.mjs` mide `tokens.css`, que es el tema de fábrica;
 * un tema instalado se aplica tal como viene. Es la consecuencia aceptada de
 * dejar que alguien más elija los colores, y está anotada en ADR-0025.
 */
export interface ThemeFile {
  colors: Partial<Record<ThemeColorToken, string>>;
  tokenColors?: readonly TokenColorRule[];
}
