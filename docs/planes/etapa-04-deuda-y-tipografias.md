# Etapa 4 — Deuda barata, tipografías e idioma

[← Etapa 3](./etapa-03-confianza.md) · [Planes de ejecución](./README.md) · [Siguiente: diseño I →](./etapa-05-diseno-estructura.md)

**Rama:** `claude/ide-exponential-improvements-mh7gtv-e4` · **PR contra:** `claude/ide-exponential-improvements-mh7gtv-e3`

## Objetivo

Tres deudas chicas que comparten una causa: cosas que el proyecto declara y no cumple.

- Settings que el schema acepta y ningún código lee.
- Tres pilas tipográficas monoespaciadas distintas, escritas a mano en tres lugares.
- RNF-29 pide enviar `en` y `es`, y sólo existe `es`.

Ver "Funcionalidades" y "Tipografías" en el [informe](../informes/2026-11-auditoria.md).

## Leer antes

- `packages/core/src/settings/schema.ts` y `merge.ts`, con sus tests.
- `renderer/stores/editor-store.ts` (el flujo de `save`), `renderer/features/editor/use-monaco-editor.ts`, `renderer/features/terminal/use-terminal.ts`.
- `renderer/i18n/index.ts` y `es.ts`.
- [`docs/05-modelo-de-datos.md`](../05-modelo-de-datos.md), sección de settings.

---

## Tareas

### T1 — `files.autoSave` y `files.autoSaveDelay`

| Modo            | Cuándo guarda                                                      |
| --------------- | ------------------------------------------------------------------ |
| `off`           | Nunca, como hoy                                                    |
| `afterDelay`    | Pasados `autoSaveDelay` ms desde la última edición                 |
| `onFocusChange` | Cuando el editor pierde el foco, se cambia de pestaña o de ventana |

- La tabla de decisión —dado un modo y un disparador, ¿se guarda?— es pura: a `packages/core`, con test.
- El temporizador vive en el renderer, en un hook nuevo. Se testea con los timers falsos de Vitest.
- **`save` hoy guarda la pestaña activa**, leyendo del editor enfocado. El auto-guardado de `afterDelay` tiene que poder guardar la pestaña que se editó aunque ya no sea la activa: mirá cómo está armado antes de elegir entre extender `save` o guardar al cambiar de pestaña.

**Lo que el auto-guardado no puede hacer:**

- **Forzar.** Si `fs:writeFile` responde con conflicto —el archivo cambió en disco—, el auto-guardado se detiene para ese archivo y deja que el diálogo de conflicto existente lo resuelva. Nunca `force: true`.
- **Abrir el diálogo de conflicto en loop.** Una vez por conflicto.
- **Pisar una escritura del asistente.** Mirá `stores/ai-edits.ts` y `noteOwnWrite`.
- **Reemplazar a los backups de RNF-08.** Son cosas distintas y conviven.

### T2 — `files.trimTrailingWhitespace`

- Función pura en `core` que, dadas las líneas, devuelve los rangos a borrar. Con tests: LF y CRLF, líneas vacías, tabs, y archivo sin nada que recortar.
- Se aplica **como una edición del modelo de Monaco** antes de leer el contenido a guardar, para que entre en el historial de deshacer y no mueva el cursor.
- **Markdown queda exento**: dos espacios al final de una línea son un salto de línea.

**El default cambia de `true` a `false`.** El schema lo declara en `true`, pero nunca estuvo activo: cablearlo así haría que, al actualizar, cada guardado empiece a tocar líneas que nadie editó, y eso ensucia el diff de cualquier proyecto. Es un cambio de default y hay que dejarlo escrito en `05-modelo-de-datos.md` y en el `CHANGELOG`.

### T3 — `editor.formatOnSave`

Depende de formatear por LSP, que es la [etapa 9](./etapa-09-ide-lenguaje.md). Acá **no se cablea**. Dejá el JSDoc del campo y `05-modelo-de-datos.md` diciendo que no tiene efecto todavía y dónde se activa. Es la única de las cinco que queda declarada sin efecto, y queda a la vista.

`window.zoomLevel` ya lo cableó la etapa 1.

### T4 — Una sola pila monoespaciada

`packages/core/src/theme/fonts.ts`, nuevo: dos constantes.

- **Monoespaciada**, de la más específica a la más general, cubriendo las tres plataformas: Cascadia Code y Cascadia Mono (Windows 11), Consolas (Windows 10), SF Mono y Menlo (macOS), DejaVu Sans Mono y Liberation Mono (Linux), y `monospace`.
- **De interfaz**: Segoe UI, `system-ui`, y los equivalentes de macOS y Linux.

Esa constante pasa a ser:

- el default de `editor.fontFamily`;
- el default de `terminal.fontFamily`, **setting nueva** —hoy la fuente de la terminal está escrita en `use-terminal.ts`—, aplicada en caliente igual que `terminal.fontSize`;
- lo que dice `--font-mono` en `tokens.css`. CSS no puede importar TypeScript: un test lee `tokens.css` y verifica que las dos pilas coincidan con las constantes, con la misma idea que `scripts/check-contrast.mjs`.

**`editor.fontLigatures`**, setting nueva, booleana, `false` por omisión (RF-804). Verificá el nombre de la opción en los tipos de Monaco.

**No se empaqueta ninguna fuente.** Pero corregí el comentario de `tokens.css` que lo justifica con "megabytes": una variable en `woff2` son unos 300KB. La razón que sí vale es que las pilas del sistema alcanzan y no hay nada que mantener.

Los campos nuevos son aditivos: `SETTINGS_VERSION` no cambia.

### T5 — Inglés

- `renderer/i18n/en.ts`, tipado como `Record<TranslationKey, string>`: una clave que falte **no compila**.
- `packages/core`: `resolveLocale(setting, systemLanguage)` que devuelve `'es'` o `'en'`. Con test.
- Setting nueva `window.locale`: `'auto'` (por omisión), `'es'` o `'en'`. Con `auto`, un sistema en español ve español y cualquier otro ve inglés.
- `t()` lee el idioma activo; cambiar la setting repinta sin reiniciar.
- El atributo `lang` del `<html>` sigue al idioma activo.

**El E2E no puede cambiar de idioma por accidente.** Los runners del CI están en inglés, así que con `auto` la suite entera pasaría a ver la UI en inglés y cualquier aserto sobre un texto en español se rompería. Fijá el idioma de la suite en un solo lugar: una variable `PASTECODE_E2E_LOCALE` leída en `main/environment.ts` **sólo si `!app.isPackaged`**, igual que las demás, y puesta desde `e2e/playwright.config.ts` y `e2e/playwright.perf.config.ts`. Los specs no se tocan.

Agregá un spec corto que arranque en inglés y verifique dos o tres textos.

**Lo que queda afuera, y se dice:** los mensajes de error que vienen del main (`userMessage` de las clases de `packages/core/src/errors/`) siguen en español. Traducirlos pide que el renderer traduzca por `code`, y varios mensajes interpolan valores que hoy no viajan por separado. Dejalo como requerimiento abierto en RNF-29, con ese diseño propuesto, en vez de traducir la mitad.

### T6 — Documentación

- `docs/05-modelo-de-datos.md`: las settings nuevas, el default que cambió y la nota de `formatOnSave`.
- `docs/03-requerimientos-funcionales.md`: RF-804 cerrado.
- `docs/04-requerimientos-no-funcionales.md`: RNF-29 con su estado real.
- `CHANGELOG.md` y `PROGRESO.md`.

---

## Criterios de aceptación

1. Los cuatro comandos de verificación pasan, y el CI del PR está en verde.
2. `autoSave` funciona en sus tres modos y nunca fuerza una escritura en conflicto. Hay tests de las dos cosas.
3. `trimTrailingWhitespace` recorta al guardar, se puede deshacer y respeta Markdown.
4. Editor, terminal y `--font-mono` salen de la misma constante, y un test lo verifica.
5. `en.ts` cubre todas las claves, y `window.locale` cambia el idioma en caliente.
6. La suite E2E existente pasa sin modificar ningún spec.
7. `05-modelo-de-datos.md` describe cada setting con su efecto real.

## Trampas

- **Guardar dispara cosas.** El watcher, el refresco de Git, el LSP. Un auto-guardado cada segundo las dispara cada segundo: medí que `afterDelay` con el valor mínimo no degrade RNF-02.
- **`exactOptionalPropertyTypes`.** Mirá el comentario de `resolveSettings` sobre por qué usa `Object.assign`: agregar campos al schema tiene que seguir ese molde.
- **Los títulos de comandos de extensiones no están en el diccionario.** `isTranslationKey` existe para eso; no lo rompas al tocar `t()`.
- **El test de `tokens.css` contra las constantes** tiene que comparar ignorando espacios y saltos de línea, o va a fallar por formato.
