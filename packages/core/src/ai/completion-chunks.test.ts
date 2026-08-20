import { describe, expect, it } from 'vitest';

import {
  applyCompletionChunk,
  completedToolCalls,
  EMPTY_COMPLETION,
  type CompletionState,
} from './completion-chunks.js';

/** Aplica varios chunks en orden, como haría el cliente con el stream. */
function accumulate(chunks: readonly unknown[]): CompletionState {
  return chunks.reduce<CompletionState>(applyCompletionChunk, EMPTY_COMPLETION);
}

describe('applyCompletionChunk', () => {
  it('concatena el texto de los deltas', () => {
    const state = accumulate([
      { choices: [{ delta: { content: 'ho' } }] },
      { choices: [{ delta: { content: 'la' } }] },
    ]);

    expect(state.content).toBe('hola');
  });

  it('no muta el estado que entra', () => {
    const before = EMPTY_COMPLETION;
    applyCompletionChunk(before, { choices: [{ delta: { content: 'x' } }] });

    expect(before.content).toBe('');
  });

  it('cose una llamada a herramienta partida en varios chunks', () => {
    // El modelo no manda los argumentos de una: los escupe de a pedazos, y el
    // id y el nombre sólo vienen en el primero.
    const state = accumulate([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: 'call_1', function: { name: 'read_file', arguments: '{"pa' } },
              ],
            },
          },
        ],
      },
      {
        choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'th":"a' } }] } }],
      },
      {
        choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '.ts"}' } }] } }],
      },
    ]);

    expect(state.toolCalls).toEqual([
      { id: 'call_1', name: 'read_file', arguments: '{"path":"a.ts"}' },
    ]);
  });

  it('no mezcla los argumentos de dos herramientas pedidas a la vez', () => {
    // Es el bug que el índice existe para evitar: concatenar sin mirarlo deja
    // un JSON que parsea y dice cualquier cosa.
    const state = accumulate([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: 'a', function: { name: 'read_file', arguments: '{"path":' } },
                { index: 1, id: 'b', function: { name: 'list_files', arguments: '{"path":' } },
              ],
            },
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, function: { arguments: '"uno"}' } },
                { index: 1, function: { arguments: '"dos"}' } },
              ],
            },
          },
        ],
      },
    ]);

    expect(state.toolCalls.map((call) => call.arguments)).toEqual([
      '{"path":"uno"}',
      '{"path":"dos"}',
    ]);
  });

  it('no pisa el id ni el nombre con los undefined de los trozos siguientes', () => {
    const state = accumulate([
      {
        choices: [
          {
            delta: {
              tool_calls: [{ index: 0, id: 'call_1', function: { name: 'read_file' } }],
            },
          },
        ],
      },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{}' } }] } }] },
    ]);

    expect(state.toolCalls[0]).toEqual({ id: 'call_1', name: 'read_file', arguments: '{}' });
  });

  it('guarda el motivo de finalización cuando el modelo lo manda', () => {
    const state = accumulate([{ choices: [{ finish_reason: 'tool_calls' }] }]);

    expect(state.finishReason).toBe('tool_calls');
  });

  it('tolera un content nulo, que es como algunos modelos abren el stream', () => {
    const state = accumulate([{ choices: [{ delta: { content: null } }] }]);

    expect(state.content).toBe('');
  });

  it('ignora un chunk que no parsea en vez de cortar el stream', () => {
    const state = accumulate([
      { choices: [{ delta: { content: 'a' } }] },
      { esto: 'no es un chunk' },
      null,
      { choices: [{ delta: { content: 'b' } }] },
    ]);

    expect(state.content).toBe('ab');
  });

  it('ignora un chunk sin choices', () => {
    expect(accumulate([{ choices: [] }]).content).toBe('');
  });
});

describe('completedToolCalls', () => {
  it('devuelve las que tienen id y nombre', () => {
    const state = accumulate([
      {
        choices: [
          { delta: { tool_calls: [{ index: 0, id: 'a', function: { name: 'read_file' } }] } },
        ],
      },
    ]);

    expect(completedToolCalls(state)).toHaveLength(1);
  });

  it('descarta los huecos que deja un índice salteado', () => {
    // `index` es una posición y no un contador: si el primer trozo es el del
    // índice 1, el 0 queda como un agujero que no se puede ejecutar.
    const state = accumulate([
      {
        choices: [
          { delta: { tool_calls: [{ index: 1, id: 'b', function: { name: 'list_files' } }] } },
        ],
      },
    ]);

    expect(completedToolCalls(state)).toEqual([{ id: 'b', name: 'list_files', arguments: '' }]);
  });

  it('devuelve una lista vacía cuando no hubo herramientas', () => {
    expect(completedToolCalls(EMPTY_COMPLETION)).toEqual([]);
  });
});
