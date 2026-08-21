import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTempDirectory, removeTempDirectory } from '../test-support/temp-directory.js';

import { resolveWriteProposal, runReadOnlyTool } from './workspace-tools.js';

/**
 * El workspace y las settings, moqueados.
 *
 * Son los dos módulos globales del main que estas funciones consultan, y
 * moquearlos es lo que permite apuntar a un `mkdtemp` sin tocar el estado de
 * la app. Es el mismo formato que usa `ipc/fs.test.ts`.
 */
const state = vi.hoisted(() => ({ root: '' }));

vi.mock('../services/workspace.js', () => ({
  requireWorkspaceRoot: (): string => state.root,
}));

vi.mock('../services/settings.js', () => ({
  currentSettings: () => ({ files: { exclude: ['**/node_modules'] } }),
}));

/**
 * La búsqueda, moqueada.
 *
 * Lanzar ripgrep de verdad acá sería testear ripgrep: lo que importa es que la
 * herramienta corte al juntar suficiente y que arme el texto que lee el modelo.
 */
const search = vi.hoisted(
  (): { matches: { path: string; line: number; preview: string }[]; killed: boolean } => ({
    matches: [],
    killed: false,
  })
);

vi.mock('../services/search.js', () => ({
  spawnSearch: (
    _query: unknown,
    _root: string,
    callbacks: {
      onResult: (matches: unknown[]) => void;
      onDone: (outcome: { truncated: boolean; error: null }) => void;
    }
  ) => {
    queueMicrotask(() => {
      if (search.matches.length > 0) callbacks.onResult(search.matches);
      callbacks.onDone({ truncated: false, error: null });
    });

    return {
      kill: () => {
        search.killed = true;
      },
    };
  },
}));

beforeEach(() => {
  search.matches = [];
  search.killed = false;
});

/** Prepara un workspace de prueba con unos archivos adentro. */
async function withWorkspace(run: (root: string) => Promise<void>): Promise<void> {
  const root = await makeTempDirectory('pastecode-ai-tools-');
  state.root = root;

  try {
    await writeFile(join(root, 'uno.ts'), 'const uno = 1;\nconst dos = 2;\n', 'utf8');
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src', 'dos.ts'), 'export {};\n', 'utf8');
    await mkdir(join(root, 'node_modules'));

    await run(root);
  } finally {
    await removeTempDirectory(root);
  }
}

describe('list_files', () => {
  it('lista un nivel, con las carpetas marcadas con barra', async () => {
    await withWorkspace(async () => {
      const listed = await runReadOnlyTool('list_files', '{}');

      expect(listed.split('\n')).toContain('src/');
      expect(listed.split('\n')).toContain('uno.ts');
    });
  });

  it('respeta las mismas exclusiones que ve el explorador', async () => {
    // RF-005: una sola clave configurable filtra el árbol, la búsqueda y esto.
    await withWorkspace(async () => {
      expect(await runReadOnlyTool('list_files', '{}')).not.toContain('node_modules');
    });
  });

  it('avisa cuando la carpeta está vacía, en vez de devolver nada', async () => {
    await withWorkspace(async (root) => {
      await mkdir(join(root, 'vacia'));

      expect(await runReadOnlyTool('list_files', '{"path":"vacia"}')).toContain('vacía');
    });
  });
});

describe('read_file', () => {
  it('devuelve el contenido con las líneas numeradas', async () => {
    // Numeradas para que el modelo pueda decir "en la línea 42" y que eso
    // signifique algo: sin los números cuenta a ojo y se equivoca.
    await withWorkspace(async () => {
      const content = await runReadOnlyTool('read_file', '{"path":"uno.ts"}');

      expect(content.split('\n')[0]).toBe('1\tconst uno = 1;');
      expect(content.split('\n')[1]).toBe('2\tconst dos = 2;');
    });
  });

  it('rechaza una ruta que se escapa del workspace', async () => {
    // RNF-11: una ruta que el modelo se inventó se rechaza exactamente igual
    // que una que se invente el renderer.
    await withWorkspace(async () => {
      await expect(
        runReadOnlyTool('read_file', '{"path":"../../secretos.txt"}')
      ).rejects.toThrow();
    });
  });
});

describe('search_workspace', () => {
  it('arma una línea por coincidencia, con archivo y número de línea', async () => {
    search.matches = [{ path: 'uno.ts', line: 2, preview: '  const dos = 2;' }];

    await withWorkspace(async () => {
      const found = await runReadOnlyTool('search_workspace', '{"query":"dos"}');

      expect(found).toBe('uno.ts:2: const dos = 2;');
    });
  });

  it('lo dice cuando no hay coincidencias', async () => {
    await withWorkspace(async () => {
      expect(await runReadOnlyTool('search_workspace', '{"query":"zzz"}')).toContain(
        'Sin coincidencias'
      );
    });
  });

  it('corta apenas junta suficiente en vez de leer hasta el techo', async () => {
    // Seguir hasta las mil para quedarse con cuarenta es trabajo tirado, y
    // sobre un repo grande deja al modelo esperando por nada.
    search.matches = Array.from({ length: 60 }, (_, index) => ({
      path: 'uno.ts',
      line: index + 1,
      preview: 'dos',
    }));

    await withWorkspace(async () => {
      const found = await runReadOnlyTool('search_workspace', '{"query":"dos"}');

      expect(search.killed).toBe(true);
      expect(found).toContain('se muestran las primeras 40');
    });
  });
});

describe('resolveWriteProposal', () => {
  it('devuelve la ruta ya validada y lo que hay hoy en el archivo', async () => {
    await withWorkspace(async (root) => {
      const proposal = await resolveWriteProposal('{"path":"uno.ts","content":"nuevo"}');

      expect(proposal.path.toLowerCase()).toContain(join(root, 'uno.ts').toLowerCase());
      expect(proposal.nextContent).toBe('nuevo');
      expect(proposal.previousContent).toContain('const uno = 1;');
    });
  });

  it('devuelve null como contenido anterior si el archivo no existe', async () => {
    // Es lo que le dice al diff que muestre una creación y no un reemplazo.
    await withWorkspace(async () => {
      const proposal = await resolveWriteProposal('{"path":"nuevo.ts","content":"x"}');

      expect(proposal.previousContent).toBeNull();
    });
  });

  it('rechaza una propuesta que apunta fuera del workspace', async () => {
    await withWorkspace(async () => {
      await expect(
        resolveWriteProposal('{"path":"../fuera.ts","content":"x"}')
      ).rejects.toThrow();
    });
  });
});
