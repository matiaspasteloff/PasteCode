# Convenciones · Testing

[← Git](./git.md) · [Índice](../README.md) · [Seguridad →](./seguridad.md)

---

## Pirámide de tests

```
        ╱╲          E2E (Playwright)          ~30 spec files
       ╱  ╲         Flujos críticos completos
      ╱────╲
     ╱      ╲       Integración (Vitest)      ~150 tests
    ╱        ╲      IPC, servicios, LSP mockeado
   ╱──────────╲
  ╱            ╲    Unitarios (Vitest)        ~500 tests
 ╱______________╲   Lógica pura de packages/core
```

---

## Unitarios

Todo `packages/core`. Lógica pura, sin I/O, sin mocks complejos. **Si un test necesita muchos mocks, la unidad está mal diseñada.**

```typescript
// packages/core/src/keybindings/resolver.test.ts
import { describe, it, expect } from 'vitest';
import { resolveKeybinding } from './resolver';

describe('resolveKeybinding', () => {
  it('resuelve un binding simple cuando el contexto coincide', () => {
    const bindings = [{ key: 'ctrl+s', command: 'file.save', when: 'editorFocus' }];
    const result = resolveKeybinding(bindings, 'ctrl+s', { editorFocus: true });
    expect(result).toEqual({ command: 'file.save' });
  });

  it('devuelve null cuando la cláusula when no se cumple', () => {
    const bindings = [{ key: 'ctrl+s', command: 'file.save', when: 'editorFocus' }];
    const result = resolveKeybinding(bindings, 'ctrl+s', { editorFocus: false });
    expect(result).toBeNull();
  });

  it('prioriza el binding más específico ante conflicto', () => {
    const bindings = [
      { key: 'ctrl+f', command: 'editor.find', when: 'editorFocus' },
      { key: 'ctrl+f', command: 'terminal.find', when: 'editorFocus && terminalFocus' },
    ];
    const result = resolveKeybinding(bindings, 'ctrl+f', {
      editorFocus: true,
      terminalFocus: true,
    });
    expect(result).toEqual({ command: 'terminal.find' });
  });
});
```

---

## Integración

Handlers de IPC, servicios con filesystem real (en `tmpdir`), supervisión de procesos con binarios falsos.

```typescript
// apps/desktop/src/main/ipc/fs.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleReadFile } from './fs';

describe('handleReadFile', () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'pastecode-test-'));
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it('lee un archivo dentro del workspace', async () => {
    const filePath = join(workspace, 'test.txt');
    await writeFile(filePath, 'hola');

    const result = await handleReadFile({ path: filePath }, workspace);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.content).toBe('hola');
  });

  it('rechaza path traversal fuera del workspace', async () => {
    const result = await handleReadFile(
      { path: join(workspace, '..', '..', 'secreto.txt') },
      workspace
    );

    expect(result.ok).toBe(false);
    // `!result.ok` y no `result.ok === false`: la regla
    // `no-unnecessary-boolean-literal-compare` rechaza lo segundo, y el
    // narrowing funciona igual.
    expect(!result.ok && result.error.code).toBe('PATH_OUTSIDE_WORKSPACE');
  });
});
```

---

## E2E

Sólo los flujos que un usuario realmente hace. Son lentos y frágiles; se mantienen **pocos y valiosos**.

```typescript
// e2e/edit-and-save.spec.ts
import { test, expect, _electron as electron } from '@playwright/test';

test('abrir workspace, editar archivo y guardar', async () => {
  const app = await electron.launch({ args: ['.'] });
  const window = await app.firstWindow();

  await window.getByRole('button', { name: 'Abrir carpeta' }).click();
  // (el diálogo nativo se mockea vía flag de test)

  await window.getByRole('treeitem', { name: 'index.ts' }).click();
  await expect(window.locator('.monaco-editor')).toBeVisible();

  await window.locator('.monaco-editor textarea').fill('const x = 1;');
  await expect(window.getByTestId('tab-dirty-indicator')).toBeVisible();

  await window.keyboard.press('Control+S');
  await expect(window.getByTestId('tab-dirty-indicator')).toBeHidden();

  await app.close();
});
```

---

## Reglas de testing

1. Los tests describen **comportamiento**, no implementación. Si un refactor interno rompe tests sin cambiar comportamiento, los tests estaban mal.
2. Nombres de test en formato "hace X cuando Y", **en español**. Los identificadores del código de test —variables, helpers, fixtures— van en inglés, como todo el código del repo. Es la misma división que usa el resto del proyecto: el código se escribe en inglés, lo que se lee como prosa se escribe en español.
3. **Cero tests flaky tolerados.** Un test flaky se arregla o se borra, no se reintenta.
4. Todo bug reportado se convierte primero en un test que falla, y después se arregla.
5. Los tests no dependen del orden de ejecución ni comparten estado.
6. Tests E2E: máximo **30 spec files**, todos por debajo de 30s cada uno. **Al llegar al tope, se fusionan casos relacionados en vez de subir el número**: el límite existe para que la suite siga siendo rápida y para obligar a elegir qué flujos valen un E2E.

> **Corrección de redacción, Etapa 4.** Hasta acá la regla decía "máximo 30 tests" y el diagrama de arriba decía lo mismo. Antes de la Etapa 4 la suite tenía exactamente **30 tests en 12 archivos**, así que el número era ambiguo: podía leerse de las dos formas y nadie se había cruzado con la diferencia.
>
> Se corrige a **spec files** y no se sube el número, por dos razones. La primera es que es lo que el límite quiere controlar: un spec file arranca su propia instancia de Electron —que es lo que cuesta— mientras que un `test()` más adentro de un archivo ya levantado cuesta segundos. La segunda es que la unidad de decisión real es "¿este flujo merece un E2E propio?", y ésa se toma por archivo.
>
> El techo de 30 segundos por test **no se toca**: es el que mantiene la suite usable, y es el que de verdad duele cuando se rompe.

---

## Cobertura

| Paquete                     | Mínimo           |
| --------------------------- | ---------------- |
| `packages/core`             | 80%              |
| `packages/ipc-contract`     | N/A (sólo tipos) |
| `apps/desktop/src/main`     | 70%              |
| `apps/desktop/src/renderer` | 50%              |
| **Global**                  | **60%**          |

Del denominador queda afuera lo que **no se puede ejercer sin el programa vivo**, que es trabajo del E2E y no del test unitario: el arranque y la creación de ventanas del main, el punto de entrada del renderer, y la capa que le habla a la API de Monaco ([ADR-0024](../adr/0024-cobertura-sin-la-capa-de-monaco.md)). La lista exacta vive en el `vitest.config.ts` de cada paquete. Excluir algo de ahí es una decisión que se argumenta, no un atajo para que el número suba: si un módulo se puede testear sin mentir, se testea.

El CI falla si la cobertura queda **por debajo de estos umbrales absolutos**, no si baja respecto de `main`. Es el mismo razonamiento de [ADR-0015](../adr/0015-presupuestos-absolutos-de-performance.md): un umbral relativo convierte cualquier PR grande y bien testeado en un fallo cuando toca código que ya estaba mejor cubierto que el promedio, y obliga a tener un `main` de referencia disponible en cada corrida. Ver [RNF-17](../04-requerimientos-no-funcionales.md#mantenibilidad).

---

[← Git](./git.md) · [Índice](../README.md) · [Seguridad →](./seguridad.md)
