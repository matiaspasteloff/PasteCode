# Convenciones · Código

[← Índice de documentación](../README.md) · [Git →](./git.md)

---

## TypeScript

**Configuración obligatoria** en `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler"
  }
}
```

### 1. Prohibido `any`

Si de verdad no se conoce el tipo, se usa `unknown` y se hace narrowing.

```typescript
// ❌ MAL
function parseConfig(raw: any) {
  return raw.editor.fontSize;
}

// ✅ BIEN
function parseConfig(raw: unknown): Settings {
  return SettingsSchema.parse(raw); // Zod valida y tipa
}
```

### 2. Prohibidas las aserciones de tipo (`as`)

Salvo en los límites del sistema y con comentario justificando.

```typescript
// ❌ MAL
const settings = JSON.parse(content) as Settings;

// ✅ BIEN
const settings = SettingsSchema.parse(JSON.parse(content));
```

### 3. Los errores esperables se devuelven, no se lanzan

Las excepciones son para bugs, no para flujo de control.

```typescript
// ✅ BIEN — el resultado es parte del tipo
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

async function readFile(path: string): Promise<Result<string, FileError>> {
  try {
    const content = await fs.readFile(path, 'utf8');
    return { ok: true, value: content };
  } catch (cause) {
    return { ok: false, error: new FileError(`No se pudo leer ${path}`, { cause }) };
  }
}

// El caller está obligado por el tipo a manejar el caso de error
const result = await readFile(path);
if (!result.ok) {
  showError(result.error);
  return;
}
console.log(result.value); // TypeScript sabe que acá es string
```

### 4. Interfaces vs. type

`interface` para formas de objetos, `type` para uniones y utilidades.

### 5. Nada de enums de TypeScript

Se usan uniones de literales o const objects.

```typescript
// ❌ MAL — genera código en runtime, mala interoperabilidad
enum Theme { Light, Dark }

// ✅ BIEN
const THEMES = ['light', 'dark', 'system'] as const;
type Theme = typeof THEMES[number];
```

---

## Convenciones de nombres

| Elemento | Convención | Ejemplo |
|---|---|---|
| Archivos de código | `kebab-case.ts` | `file-watcher.ts` |
| Componentes React | `PascalCase.tsx` | `FileTree.tsx` |
| Clases e interfaces | `PascalCase` | `WorkspaceService` |
| Funciones y variables | `camelCase` | `resolveWorkspacePath` |
| Constantes globales | `SCREAMING_SNAKE_CASE` | `DEFAULT_TAB_SIZE` |
| Tipos genéricos | `T` + nombre descriptivo | `TPayload` |
| Booleanos | Prefijo `is`/`has`/`should`/`can` | `isDirty`, `hasUnsavedChanges` |
| Handlers de eventos | Prefijo `handle` | `handleFileClick` |
| Props de callback | Prefijo `on` | `onFileSelect` |
| Canales IPC | `dominio:acción` | `fs:readFile` |
| Comandos | `namespace.acción` | `editor.formatDocument` |

---

## Reglas de React (renderer)

1. Sólo function components con hooks. Nada de class components.
2. Un componente por archivo. El archivo se llama igual que el componente.
3. Componentes de presentación separados de los que tienen lógica. Los primeros no llaman a servicios ni a IPC.
4. Toda lista virtualizada si puede superar los 100 ítems (árbol de archivos, resultados de búsqueda). Usar `@tanstack/react-virtual`.
5. Nada de `useEffect` para derivar estado. Si se puede calcular durante el render, se calcula.

```typescript
// ❌ MAL — estado derivado innecesario
const [filtered, setFiltered] = useState<File[]>([]);
useEffect(() => {
  setFiltered(files.filter(f => f.name.includes(query)));
}, [files, query]);

// ✅ BIEN — derivado en el render
const filtered = useMemo(
  () => files.filter(f => f.name.includes(query)),
  [files, query]
);
```

---

## Manejo de errores

### Toda clase de error hereda de `PasteCodeError`

Con un `code` estable y un `userMessage` legible.

```typescript
export class PasteCodeError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly userMessage: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class FileAccessError extends PasteCodeError {
  constructor(path: string, cause?: unknown) {
    super(
      `File access denied: ${path}`,
      'FILE_ACCESS_DENIED',
      `No se pudo acceder al archivo. Verificá los permisos de "${path}".`,
      { cause }
    );
  }
}
```

### Reglas

1. La UI muestra `userMessage`, nunca `message` ni el stack. El stack va al log. Ver [RNF-25](../04-requerimientos-no-funcionales.md#usabilidad-y-accesibilidad).
2. Prohibido `catch` vacío. Como mínimo, loguear.
3. Prohibido tragarse errores de operaciones asíncronas. Toda promesa se `await`ea o se maneja explícitamente con `.catch()`.

---

## Comentarios y documentación

Los comentarios explican **por qué**, nunca **qué**. El qué lo dice el código.

```typescript
// ❌ MAL
// Incrementa el contador
counter++;

// ✅ BIEN
// Monaco dispara onDidChangeModelContent dos veces por edición cuando hay
// multi-cursor; contamos para deduplicar antes de marcar el archivo como dirty.
counter++;
```

- Toda función exportada pública lleva JSDoc con `@example` ([RNF-19](../04-requerimientos-no-funcionales.md#mantenibilidad)).
- Prohibido dejar código comentado. Para eso está Git.
- Los `TODO` llevan issue asociado: `// TODO(#123): manejar symlinks circulares`.

---

## Límites de tamaño ([RNF-20](../04-requerimientos-no-funcionales.md#mantenibilidad))

| Límite | Valor |
|---|---|
| Líneas por archivo | 400 |
| Líneas por función | 50 |
| Complejidad ciclomática | 10 |

Se aplican vía ESLint. Superarlos falla el CI.

---

## Herramientas de calidad

| Herramienta | Rol |
|---|---|
| **ESLint** + `@typescript-eslint` | Linting con reglas type-aware |
| **Prettier** | Formateo — sin discusiones de estilo |
| **Vitest** | Tests unitarios y de integración |
| **Playwright** | Tests E2E sobre Electron |
| **Knip** | Detección de código muerto y dependencias sin usar |
| **madge** | Detección de dependencias circulares — falla el CI si encuentra alguna |
| **size-limit** | Presupuesto de tamaño de bundle |
| **Husky** + **lint-staged** | Hooks de pre-commit |

---

[← Índice de documentación](../README.md) · [Git →](./git.md)
