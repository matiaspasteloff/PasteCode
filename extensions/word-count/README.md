# Word Count

Cuenta las palabras del documento activo y las muestra en la status bar. Es la
extensión de ejemplo de **RF-904** (status bar) y **RF-905** (documento activo).

## Qué demuestra

Las tres cosas que una extensión con código necesita hacer:

- **Registrar un comando** (`wordCount.toggle`), que aparece en la paleta al lado
  de los de fábrica.
- **Poner un ítem en la status bar**, con su texto y su comando al hacer clic.
- **Leer el documento activo** cuando lo necesita, con debounce.

Y una que es más interesante por lo que **no** hace: nunca recibe el texto sin
pedirlo. El evento de cambio de documento trae `path`, `languageId` y `version`;
el contenido se pide con `getText()`. Si el evento arrastrara el texto, cada
tecla serían dos saltos de proceso con el archivo entero adentro. Ver
[ADR-0026](../../docs/adr/0026-broker-unico-y-pull-del-documento-activo.md).

## Capabilities

```json
"capabilities": ["statusBar", "documentRead"]
```

Declara lectura y **no** escritura, aunque la API tenga `edit()`. Es el punto de
haber partido `documentRead` de `documentWrite`: pedir permiso de escritura para
no usarlo nunca es cómo los permisos dejan de significar algo.

## Activation events

```json
"activationEvents": ["onLanguage:markdown", "onCommand:wordCount.toggle"]
```

No se activa al arrancar el IDE. Se despierta cuando aparece un markdown, o
cuando alguien busca su comando en la paleta — que es lo que hace que una
extensión instalada y no usada no cueste nada.

## Cómo se compila

```bash
pnpm --filter word-count build
```

`tsc` a ESM, sin bundler. La API es sólo tipos, así que el `import type` se borra
al compilar y `dist/extension.js` no importa nada: es lo que hace que una
extensión no arrastre la lógica interna del IDE.
