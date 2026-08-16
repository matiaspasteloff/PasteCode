import { describe, expect, it } from 'vitest';

import {
  buildBranchListArgs,
  buildCheckoutArgs,
  buildCommitArgs,
  buildFileDiffArgs,
  buildStageArgs,
  buildStatusArgs,
  buildToplevelArgs,
  buildUnstageArgs,
} from './args.js';

describe('buildStatusArgs', () => {
  it('pide la porcelana v2 con la rama y separadores NUL', () => {
    expect(buildStatusArgs()).toEqual([
      'status',
      '--porcelain=v2',
      '--branch',
      '-z',
      '--untracked-files=normal',
    ]);
  });
});

describe('buildToplevelArgs', () => {
  it('pregunta por la raíz del repositorio', () => {
    expect(buildToplevelArgs()).toEqual(['rev-parse', '--show-toplevel']);
  });
});

describe('buildStageArgs', () => {
  it('separa las rutas de las opciones con --', () => {
    expect(buildStageArgs(['src/a.ts'])).toEqual(['add', '--', 'src/a.ts']);
  });

  it('trata como ruta un archivo que parece una bandera', () => {
    // Sin el `--`, esto sería `git add --force`.
    expect(buildStageArgs(['--force'])).toEqual(['add', '--', '--force']);
  });

  it('acepta varias rutas en una sola invocación', () => {
    expect(buildStageArgs(['a', 'b'])).toEqual(['add', '--', 'a', 'b']);
  });
});

describe('buildUnstageArgs', () => {
  it('usa restore --staged y no reset, que falla sin commits', () => {
    expect(buildUnstageArgs(['a'])).toEqual(['restore', '--staged', '--', 'a']);
  });
});

describe('buildCommitArgs', () => {
  it('manda el mensaje como un elemento de argv', () => {
    expect(buildCommitArgs('feat: x')).toEqual(['commit', '-m', 'feat: x']);
  });

  it('no interpreta nada de lo que haya adentro del mensaje', () => {
    const message = 'fix: comillas " y $(rm -rf /) y\nun salto';

    expect(buildCommitArgs(message)[2]).toBe(message);
  });
});

describe('buildBranchListArgs', () => {
  it('pide sólo los nombres, sin el asterisco ni el sangrado', () => {
    expect(buildBranchListArgs()).toEqual(['branch', '--format=%(refname:short)', '--list']);
  });
});

describe('buildCheckoutArgs', () => {
  it('marca el nombre como rama y no como archivo', () => {
    expect(buildCheckoutArgs('main')).toEqual(['checkout', 'main', '--']);
  });
});

describe('buildFileDiffArgs', () => {
  it('pide cero líneas de contexto, que es lo que hace útiles las cabeceras @@', () => {
    expect(buildFileDiffArgs('src/a.ts')).toEqual([
      'diff',
      '--no-color',
      '-U0',
      '--histogram',
      '--',
      'src/a.ts',
    ]);
  });
});
