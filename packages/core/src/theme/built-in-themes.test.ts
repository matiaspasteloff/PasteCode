import { describe, expect, it } from 'vitest';

import { BUILT_IN_THEMES, builtInTheme } from './built-in-themes.js';
import contrastPairs from './contrast-pairs.json' with { type: 'json' };
import { contrastRatio } from './contrast.js';

/**
 * Las claves que un tema tiene que declarar.
 *
 * Salen del primero de la lista y no de una constante escrita a mano: si
 * `buildTheme` agrega un token, la referencia se mueve sola y lo que verifica
 * el test sigue siendo lo que importa —que **todos** declaren lo mismo—.
 */
const EXPECTED_KEYS = Object.keys(BUILT_IN_THEMES[0]?.colors ?? {}).sort();

describe('BUILT_IN_THEMES', () => {
  it('trae los nueve temas del selector, con ids únicos', () => {
    const ids = BUILT_IN_THEMES.map((theme) => theme.id);

    expect(ids).toHaveLength(9);
    expect(new Set(ids).size).toBe(9);
  });

  it.each(BUILT_IN_THEMES.map((theme) => [theme.id, theme] as const))(
    '%s declara todas las claves de color',
    (_id, theme) => {
      // Es el invariante de ADR-0031: un token que un tema no declara se hereda
      // del claro o del oscuro de base, y ahí aparecen los acentos de otra
      // paleta mezclados con la elegida.
      expect(Object.keys(theme.colors).sort()).toEqual(EXPECTED_KEYS);
    }
  );

  it('declara los 16 ANSI, el cursor y la selección de la terminal', () => {
    for (const theme of BUILT_IN_THEMES) {
      const ansi = Object.keys(theme.colors).filter((key) => key.startsWith('terminal-'));

      // 16 colores más cursor, cursor-accent y selection.
      expect(ansi).toHaveLength(19);
    }
  });

  it('escribe todos los colores como hexadecimal de seis dígitos', () => {
    for (const theme of BUILT_IN_THEMES) {
      for (const [token, value] of Object.entries(theme.colors)) {
        expect(`${theme.id}.${token}=${value}`).toMatch(/=#[0-9a-f]{6}$/i);
      }
    }
  });

  it('aporta reglas de resaltado para Monaco', () => {
    for (const theme of BUILT_IN_THEMES) {
      expect(theme.tokenColors.length).toBeGreaterThan(0);
      expect(theme.tokenColors.map((rule) => rule.token)).toContain('comment');
    }
  });
});

describe('contraste de RNF-22', () => {
  it.each(BUILT_IN_THEMES.map((theme) => [theme.id, theme] as const))(
    '%s cumple el contraste mínimo en todos los pares',
    (_id, theme) => {
      // Los pares salen del mismo JSON que lee `scripts/check-contrast.mjs`.
      // Tenerlos una sola vez es lo que evita que un tema pase un umbral que
      // el otro verificador no.
      const failures = contrastPairs.pairs.flatMap(({ fg, bg, min }) => {
        const foreground = theme.colors[fg];
        const background = theme.colors[bg];

        if (foreground === undefined || background === undefined) {
          return [`falta ${fg} o ${bg}`];
        }

        const ratio = contrastRatio(foreground, background);

        return ratio < min
          ? [`${fg} sobre ${bg} da ${ratio.toFixed(2)}:1 y necesita ${String(min)}:1`]
          : [];
      });

      expect(failures).toEqual([]);
    }
  );

  it('el tema de alto contraste supera el nivel AAA en el texto principal', () => {
    // Su razón de existir: no alcanza con cumplir el mínimo de todos los demás.
    const theme = builtInTheme('high-contrast');
    const foreground = theme?.colors.foreground ?? '';
    const background = theme?.colors.background ?? '';

    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(7);
  });
});

describe('builtInTheme', () => {
  it('encuentra un tema por su id', () => {
    expect(builtInTheme('dracula')?.label).toBe('Dracula');
  });

  it('devuelve undefined para un id que no es de un incorporado', () => {
    // Un id de tema de extensión, o basura de un settings.json editado a mano.
    expect(builtInTheme('theme-nord')).toBeUndefined();
    expect(builtInTheme('')).toBeUndefined();
  });
});
