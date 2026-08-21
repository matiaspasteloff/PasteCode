import { describe, expect, it } from 'vitest';

import { freeModels } from './models.js';

/** Un modelo del catálogo, con lo mínimo para que el filtro lo mire. */
function model(id: string, prompt: string, completion: string): Record<string, unknown> {
  return { id, name: id, context_length: 8192, pricing: { prompt, completion } };
}

describe('freeModels', () => {
  it('deja pasar el que tiene precio cero y sufijo :free', () => {
    const result = freeModels({ data: [model('x/y:free', '0', '0')] });

    expect(result).toEqual([{ id: 'x/y:free', name: 'x/y:free', contextLength: 8192 }]);
  });

  it('descarta el que cobra, aunque se llame :free', () => {
    // El sufijo es una convención de nombre; el precio es la verdad.
    const result = freeModels({ data: [model('x/y:free', '0.0000015', '0')] });

    expect(result).toEqual([]);
  });

  it('descarta el de precio cero que no lleva el sufijo', () => {
    // Sin el sufijo entrarían alias de la variante paga, que sí facturan.
    const result = freeModels({ data: [model('x/y', '0', '0')] });

    expect(result).toEqual([]);
  });

  it('descarta el que no declara precios', () => {
    const result = freeModels({ data: [{ id: 'x/y:free', name: 'x' }] });

    expect(result).toEqual([]);
  });

  it('usa el id como nombre cuando el catálogo no trae uno', () => {
    const result = freeModels({
      data: [{ id: 'x/y:free', pricing: { prompt: '0', completion: '0' } }],
    });

    expect(result[0]?.name).toBe('x/y:free');
  });

  it('cae al piso de contexto cuando el catálogo no lo declara o miente', () => {
    const raw = { pricing: { prompt: '0', completion: '0' } };
    const result = freeModels({
      data: [
        { id: 'a:free', ...raw },
        { id: 'b:free', context_length: -1, ...raw },
        { id: 'c:free', context_length: 2.5, ...raw },
      ],
    });

    expect(result.map((entry) => entry.contextLength)).toEqual([8192, 8192, 8192]);
  });

  it('ordena por nombre', () => {
    const result = freeModels({
      data: [model('zeta:free', '0', '0'), model('alfa:free', '0', '0')],
    });

    expect(result.map((entry) => entry.id)).toEqual(['alfa:free', 'zeta:free']);
  });

  it('tolera campos nuevos del catálogo sin quedarse sin modelos', () => {
    // OpenRouter agrega propiedades sin avisar. Un schema estricto convertiría
    // eso en "el selector no lista nada".
    const result = freeModels({
      data: [{ ...model('x:free', '0', '0'), architecture: { modality: 'text' } }],
    });

    expect(result).toHaveLength(1);
  });

  it('devuelve una lista vacía si la respuesta entera no parsea', () => {
    expect(freeModels({ nope: true })).toEqual([]);
    expect(freeModels(null)).toEqual([]);
    expect(freeModels('')).toEqual([]);
  });
});
