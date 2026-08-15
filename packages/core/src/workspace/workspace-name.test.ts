import { describe, expect, it } from 'vitest';

import { workspaceDisplayName } from './workspace-name.js';

describe('workspaceDisplayName', () => {
  it('usa el último segmento de una ruta de Windows', () => {
    expect(workspaceDisplayName('C:\\proyectos\\PasteCode')).toBe('PasteCode');
  });

  it('usa el último segmento de una ruta POSIX', () => {
    expect(workspaceDisplayName('/home/matias/proyectos/pastecode')).toBe('pastecode');
  });

  it('conserva las mayúsculas tal como las escribió la persona', () => {
    // La comparación de rutas en Windows es insensible, pero el nombre que se
    // ve en pantalla no se pliega: es texto para leer, no para comparar.
    expect(workspaceDisplayName('C:\\Proyectos\\PasteCode')).toBe('PasteCode');
  });

  it('ignora el separador final', () => {
    expect(workspaceDisplayName('C:\\proyectos\\PasteCode\\')).toBe('PasteCode');
  });

  it('devuelve la ruta entera cuando la raíz es la unidad', () => {
    // `basename('C:\\')` da '' en Windows y 'C:\' en Linux. Ninguno de los dos
    // sirve como título de ventana, y que dependa del sistema es peor.
    expect(workspaceDisplayName('C:\\')).toBe('C:\\');
  });

  it('devuelve la ruta entera cuando la raíz es un recurso compartido', () => {
    expect(workspaceDisplayName('\\\\servidor\\recurso')).toBe('\\\\servidor\\recurso');
  });

  it('devuelve la ruta entera cuando la raíz es la raíz POSIX', () => {
    expect(workspaceDisplayName('/')).toBe('/');
  });

  it('devuelve la entrada tal cual si no es una ruta absoluta', () => {
    expect(workspaceDisplayName('proyectos/pastecode')).toBe('proyectos/pastecode');
  });
});
