import { describe, expect, it } from 'vitest';

import type { AiMessage } from './messages.js';
import { estimateTokens, trimToBudget } from './messages.js';

/** Un mensaje de `role` con `length` caracteres de contenido. */
function message(role: AiMessage['role'], length: number, mark = 'x'): AiMessage {
  return { role, content: mark.repeat(length) };
}

describe('estimateTokens', () => {
  it('cuenta cuatro caracteres por token, redondeando al alza', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abc')).toBe(1);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});

describe('trimToBudget', () => {
  it('deja la conversación intacta cuando entra', () => {
    const messages = [message('user', 40), message('assistant', 40)];

    expect(trimToBudget(messages, 8192)).toEqual(messages);
  });

  it('tira desde el principio: lo último dicho es lo que más importa', () => {
    const viejo = message('user', 400, 'a');
    const nuevo = message('user', 400, 'b');

    // 400 caracteres son 100 tokens. Con 300 de ventana el presupuesto es 225,
    // así que entran dos mensajes pero no tres.
    const result = trimToBudget([viejo, viejo, nuevo], 300);

    expect(result).toEqual([viejo, nuevo]);
  });

  it('nunca tira el system, aunque el resto no entre', () => {
    const system: AiMessage = { role: 'system', content: 'sos un asistente' };
    const enorme = message('user', 4000);

    const result = trimToBudget([system, enorme], 100);

    expect(result[0]).toEqual(system);
  });

  it('conserva el último mensaje aunque solo no entre en el presupuesto', () => {
    // Mandar una conversación sin la pregunta es mandar cualquier cosa.
    const enorme = message('user', 4000);

    expect(trimToBudget([message('user', 4000, 'a'), enorme], 100)).toEqual([enorme]);
  });

  it('pone el system adelante aunque venga en otra posición', () => {
    const system: AiMessage = { role: 'system', content: 'reglas' };
    const pregunta = message('user', 8);

    expect(trimToBudget([pregunta, system], 8192)).toEqual([system, pregunta]);
  });

  it('descarta el resultado de herramienta que se quedó sin su llamada', () => {
    // La API rechaza la conversación entera si un `tool` no sigue a la
    // llamada que lo pidió, así que el recorte no puede dejarlo huérfano.
    const grande = message('assistant', 2000, 'a');
    const resultado: AiMessage = { role: 'tool', content: 'ok', toolCallId: 'call_1' };
    const pregunta = message('user', 8, 'b');

    const result = trimToBudget([grande, resultado, pregunta], 300);

    expect(result.map((entry) => entry.role)).toEqual(['user']);
  });

  it('conserva el par assistant + tool cuando los dos entran', () => {
    const llamada = message('assistant', 8, 'a');
    const resultado: AiMessage = { role: 'tool', content: 'ok', toolCallId: 'call_1' };

    const result = trimToBudget([llamada, resultado], 8192);

    expect(result.map((entry) => entry.role)).toEqual(['assistant', 'tool']);
  });

  it('devuelve una lista vacía si no hay nada que mandar', () => {
    expect(trimToBudget([], 8192)).toEqual([]);
  });
});
