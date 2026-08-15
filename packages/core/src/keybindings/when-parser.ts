import { PasteCodeError } from '../errors/pastecode-error.js';

/** Nodo del árbol de una expresión `when`. */
export type WhenExpression =
  | { kind: 'context'; name: string }
  | { kind: 'not'; operand: WhenExpression }
  | { kind: 'and'; left: WhenExpression; right: WhenExpression }
  | { kind: 'or'; left: WhenExpression; right: WhenExpression }
  | { kind: 'compare'; name: string; negated: boolean; value: string | number | boolean };

/** La expresión `when` no se pudo parsear. */
export class InvalidWhenExpressionError extends PasteCodeError {
  constructor(expression: string, reason: string) {
    super(
      `Invalid when expression "${expression}": ${reason}`,
      'INVALID_WHEN_EXPRESSION',
      `La condición "${expression}" no es válida: ${reason}.`
    );
  }
}

/** Los operadores, del más largo al más corto para que `==` gane sobre `=`. */
const OPERATORS = ['&&', '||', '==', '!=', '!', '(', ')'] as const;

type Token = { kind: 'operator'; value: string } | { kind: 'word'; value: string };

/**
 * Parsea una expresión `when` a un árbol.
 *
 * Soporta `&&`, `||`, `!`, `==`, `!=` y paréntesis, que es exactamente lo que
 * [RF-703](../../../../docs/03-requerimientos-funcionales.md) pide con el
 * ejemplo `editorFocus && !terminalFocus`.
 *
 * Es un descenso recursivo escrito a mano y no una gramática generada: son
 * cinco operadores que no van a cambiar, y el parser entero entra en una
 * pantalla. La precedencia es la habitual, `&&` más fuerte que `||`.
 *
 * @param expression La expresión, tal como viene del `keybindings.json`.
 * @returns El árbol.
 * @throws {InvalidWhenExpressionError} Si la expresión está mal formada.
 * @example
 * parseWhen('editorFocus && !terminalFocus');
 */
export function parseWhen(expression: string): WhenExpression {
  const tokens = tokenize(expression);
  const state = { tokens, position: 0, expression };
  const parsed = parseOr(state);

  if (state.position < tokens.length) {
    throw new InvalidWhenExpressionError(expression, 'sobra texto al final');
  }

  return parsed;
}

/** El estado del parser: los tokens y por dónde va. */
interface ParserState {
  tokens: readonly Token[];
  position: number;
  expression: string;
}

function parseOr(state: ParserState): WhenExpression {
  let left = parseAnd(state);

  while (consumeOperator(state, '||')) {
    left = { kind: 'or', left, right: parseAnd(state) };
  }

  return left;
}

function parseAnd(state: ParserState): WhenExpression {
  let left = parseUnary(state);

  while (consumeOperator(state, '&&')) {
    left = { kind: 'and', left, right: parseUnary(state) };
  }

  return left;
}

function parseUnary(state: ParserState): WhenExpression {
  if (consumeOperator(state, '!')) return { kind: 'not', operand: parseUnary(state) };

  return parsePrimary(state);
}

function parsePrimary(state: ParserState): WhenExpression {
  if (consumeOperator(state, '(')) {
    const inner = parseOr(state);
    if (!consumeOperator(state, ')')) {
      throw new InvalidWhenExpressionError(state.expression, 'falta cerrar un paréntesis');
    }

    return inner;
  }

  const name = consumeWord(state);
  const negated = peekOperator(state, '!=');
  if (!negated && !peekOperator(state, '==')) return { kind: 'context', name };

  state.position += 1;

  return { kind: 'compare', name, negated, value: toValue(consumeWord(state)) };
}

function consumeOperator(state: ParserState, operator: string): boolean {
  if (!peekOperator(state, operator)) return false;

  state.position += 1;

  return true;
}

function peekOperator(state: ParserState, operator: string): boolean {
  const token = state.tokens[state.position];

  return token?.kind === 'operator' && token.value === operator;
}

function consumeWord(state: ParserState): string {
  const token = state.tokens[state.position];
  if (token?.kind !== 'word') {
    throw new InvalidWhenExpressionError(state.expression, 'se esperaba un nombre de contexto');
  }

  state.position += 1;

  return token.value;
}

/** `'true'`, `'42'` y `'algo'` no son lo mismo del otro lado de un `==`. */
function toValue(raw: string): string | number | boolean {
  if (raw === 'true') return true;
  if (raw === 'false') return false;

  const asNumber = Number(raw);

  return raw !== '' && !Number.isNaN(asNumber) ? asNumber : unquote(raw);
}

function unquote(raw: string): string {
  const isQuoted =
    raw.length >= 2 &&
    ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"')));

  return isQuoted ? raw.slice(1, -1) : raw;
}

/** Parte la expresión en operadores y palabras, salteando los espacios. */
function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let position = 0;

  while (position < expression.length) {
    const rest = expression.slice(position);
    const character = rest[0] ?? '';

    if (character.trim() === '') {
      position += 1;
      continue;
    }

    const operator = OPERATORS.find((candidate) => rest.startsWith(candidate));
    if (operator !== undefined) {
      tokens.push({ kind: 'operator', value: operator });
      position += operator.length;
      continue;
    }

    const word = /^[^\s&|!()=]+/.exec(rest)?.[0] ?? '';
    if (word === '') throw new InvalidWhenExpressionError(expression, `carácter inesperado`);

    tokens.push({ kind: 'word', value: word });
    position += word.length;
  }

  if (tokens.length === 0) throw new InvalidWhenExpressionError(expression, 'está vacía');

  return tokens;
}
