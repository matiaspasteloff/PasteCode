/**
 * El percentil de una muestra, por interpolación lineal.
 *
 * Se usa percentil y no promedio porque es lo que dicen los requerimientos:
 * [RNF-01](../../../docs/04-requerimientos-no-funcionales.md#performance) pide
 * un p95 y RNF-02 un p99. Un promedio esconde exactamente lo que interesa
 * medir —los arranques lentos, las teclas que se traban— detrás de las veces
 * que salió bien.
 *
 * La interpolación es la misma que usan `numpy.percentile` y la mayoría de las
 * herramientas: con pocas muestras, elegir "el elemento en la posición k"
 * redondeando hace que el resultado salte de golpe al agregar una medición.
 *
 * @param values La muestra. No hace falta que esté ordenada.
 * @param percentile Entre 0 y 100.
 * @returns El valor del percentil.
 * @throws {Error} Si la muestra está vacía: no hay percentil de la nada.
 * @example
 * percentileOf([10, 20, 30, 40], 95); // 38.5
 */
function percentileOf(values: readonly number[], percentile: number): number {
  if (values.length === 0) throw new Error('No se puede calcular un percentil sin muestras');

  const sorted = [...values].sort((left, right) => left - right);
  const position = ((sorted.length - 1) * percentile) / 100;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);

  const below = sorted[lower] ?? 0;
  const above = sorted[upper] ?? below;

  return below + (above - below) * (position - lower);
}

/** El resumen de una medición, tal como se reporta. */
export interface Measurement {
  /** El requerimiento que se está midiendo. Ej: `'RNF-01'`. */
  requirement: string;
  /** Qué se midió, en una línea. */
  description: string;
  /** El valor que se compara contra el presupuesto. */
  value: number;
  budget: number;
  unit: string;
  /** Cuántas corridas produjeron el valor. */
  samples: number;
}

/**
 * Arma el resumen de una muestra contra su presupuesto.
 *
 * @param options Qué se midió y con qué percentil se resume.
 * @returns La medición, lista para reportar.
 * @example
 * summarize({ requirement: 'RNF-01', ..., values: times, percentile: 95 });
 */
export function summarize(options: {
  requirement: string;
  description: string;
  values: readonly number[];
  percentile: number;
  budget: number;
  unit: string;
}): Measurement {
  return {
    requirement: options.requirement,
    description: options.description,
    value: Math.round(percentileOf(options.values, options.percentile) * 100) / 100,
    budget: options.budget,
    unit: options.unit,
    samples: options.values.length,
  };
}
