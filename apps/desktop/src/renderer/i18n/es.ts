/**
 * Diccionario de español. Único idioma activo por ahora; `en` llega en la
 * Etapa 6.
 *
 * El `as const` no es decorativo: de él sale el tipo de las claves, y con eso
 * una clave inexistente pasa a ser un error de compilación en vez de un
 * `undefined` que se ve recién en pantalla.
 *
 * Las claves se ordenan por dominio y alfabéticamente adentro de cada uno,
 * para que agregar una no sea una decisión.
 */
export const es = {
  'workspace.emptyDescription': 'Abrí una carpeta para empezar a editar.',
  'workspace.emptyTitle': 'No hay ninguna carpeta abierta',
  'workspace.open': 'Abrir carpeta',
  'workspace.opening': 'Abriendo…',
} as const;
