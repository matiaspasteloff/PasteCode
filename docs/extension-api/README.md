# API de extensiones de PasteCode

Todo lo que hace falta para escribir una extensión. Si algo de acá no alcanza y
hay que abrir el código del host, esta documentación está incompleta — decilo.

- [Empezar](#empezar)
- [El manifest](#el-manifest)
- [Activation events](#activation-events)
- [Capabilities](#capabilities)
- [Comandos](#comandos)
- [Status bar](#status-bar)
- [Documento activo](#documento-activo)
- [Temas](#temas)
- [Qué **no** hay](#qué-no-hay)

---

## Empezar

Una extensión es una carpeta con un `package.json` y, si tiene código, un módulo
ESM. Se instala copiándola a `~/.pastecode/extensions/`.

```
mi-extension/
├── package.json      ← el manifest
└── dist/
    └── extension.js  ← lo que apunta `main`
```

El módulo exporta `activate` y, opcionalmente, `deactivate`:

```ts
import type { Activate, Deactivate } from '@pastecode/extension-api';

export const activate: Activate = async (pastecode) => {
  await pastecode.commands.registerCommand('mi.comando', () => {
    // ...
  });
};

export const deactivate: Deactivate = () => {
  // Sólo los recursos **propios**: un timer, un archivo abierto.
};
```

**El objeto llega por parámetro y se llama `pastecode`.** No hay
`import * as pastecode from 'pastecode'`: eso requiere parchear la resolución de
módulos de Node, y el paquete de tipos quedaría con runtime adentro. Ver
[ADR-0025](../adr/0025-forma-de-la-api-de-extensiones.md).

`@pastecode/extension-api` es **sólo tipos**: no tiene runtime ni dependencias,
así que el `import type` se borra al compilar y tu bundle no lo incluye.

### Todo es `await`

Cada llamada cruza al menos un límite de proceso: tu código corre en el extension
host, la UI en el renderer y la autoridad en el main. Registrar un comando es una
`Promise`. Es más ruidoso que la alternativa y es lo honesto.

Toda llamada tiene un techo de **5 segundos**.

---

## El manifest

El manifest **es** el `package.json`. Puede traer todo lo que npm le ponga —
`scripts`, `devDependencies`—; el IDE mira sólo lo suyo.

```json
{
  "name": "word-count",
  "displayName": "Word Count",
  "version": "1.0.0",
  "publisher": "tu-usuario",
  "engines": { "pastecode": "^1.0.0" },
  "main": "./dist/extension.js",
  "activationEvents": ["onLanguage:markdown"],
  "capabilities": ["statusBar", "documentRead"],
  "contributes": {
    "commands": [{ "command": "wordCount.toggle", "title": "Word Count: mostrar u ocultar" }]
  }
}
```

`main` es **opcional**: una extensión que sólo aporta un tema no tiene código.

Un manifest inválido **no carga la extensión, muestra el error y deja la app
andando** (RF-902). Las demás extensiones no se enteran.

---

## Activation events

Tu extensión no se carga hasta que hace falta. Hay tres disparadores:

| Evento              | Cuándo                                      |
| ------------------- | ------------------------------------------- |
| `onStartupFinished` | Al terminar de arrancar el IDE              |
| `onCommand:<id>`    | Cuando se ejecuta ese comando               |
| `onLanguage:<id>`   | Cuando se abre un documento de ese lenguaje |

El match es **exacto**: `onCommand:wordCount` no activa por `wordCount.toggle`.

Si contribuís un comando en el manifest, aparece en la paleta **antes** de que tu
extensión se active — es lo que hace posible `onCommand:`.

---

## Capabilities

**Sin declaración, sin acceso** (RNF-14). Las verifica el main, que es el único
proceso que no ejecuta código de terceros y por lo tanto el único cuyo chequeo
significa algo.

| Capability      | Habilita                                         |
| --------------- | ------------------------------------------------ |
| `statusBar`     | `window.createStatusBarItem()`                   |
| `documentRead`  | `window.activeTextEditor` y `document.getText()` |
| `documentWrite` | `editor.edit()`                                  |
| `network`       | Reservada. Todavía no habilita nada              |

Pedir sólo lo que usás no es cortesía: una extensión que pide escritura para no
usarla nunca es cómo los permisos dejan de significar algo. `word-count` declara
`documentRead` y no `documentWrite`.

Una llamada sin su capability rechaza con `CAPABILITY_DENIED`.

---

## Comandos

```ts
const registro = await pastecode.commands.registerCommand('mi.comando', async (...args) => {
  // Los argumentos son `unknown`: llegaron de otro proceso.
});

await pastecode.commands.executeCommand('otro.comando', 'un argumento');

await registro.dispose(); // sólo si querés soltarlo antes de tiempo
```

El `id` tiene que coincidir con un `contributes.commands[].command` del manifest.

**No hay `context.subscriptions`.** El IDE ya sabe qué registró cada extensión —
brokerea todas las llamadas—, así que da de baja lo tuyo cuando te descargás sin
que colabores. El `Disposable` sirve para soltar algo antes, no para limpiar al
salir.

En la paleta tu comando aparece con el prefijo interno `ext:`, para que no puedas
quedarte —ni chocar— con un comando de fábrica como `file.save`.

---

## Status bar

```ts
const item = await pastecode.window.createStatusBarItem({ alignment: 'right', priority: 10 });

await item.setText('42 palabras');
await item.setTooltip('Palabras del documento activo');
await item.setCommand('mi.comando');
await item.show();
```

**Los setters son métodos, no propiedades.** `item.text = 'x'` andaría si la
asignación y la UI estuvieran en el mismo proceso; acá hay dos saltos, así que
una propiedad asignable sería una operación que puede fallar disfrazada de
asignación, sin nada que esperar y sin dónde ver el error.

El ítem **nace oculto**. Ponele el texto y después `show()`; al revés parpadea
vacío.

`priority` más alta va más cerca del borde.

---

## Documento activo

```ts
const editor = pastecode.window.activeTextEditor;

if (editor !== undefined) {
  console.log(editor.document.path, editor.document.languageId, editor.document.version);

  const texto = await editor.document.getText();
}
```

`activeTextEditor` se lee **sincrónicamente** porque es metadato que el IDE ya
empujó. El **texto no viaja con el evento**: se pide con `getText()`, que es un
ida y vuelta hasta el renderer. Con archivos de hasta 10MB, un push del contenido
en cada tecla serían dos saltos de proceso con el archivo entero adentro. Ver
[ADR-0026](../adr/0026-broker-unico-y-pull-del-documento-activo.md).

**Poné debounce.** En serio.

```ts
await pastecode.window.onDidChangeActiveTextEditor((editor) => {
  // El editor es una **instantánea**, no un objeto vivo. Guardarlo y usarlo
  // cinco minutos después es mirar el pasado; lo que se guarda es la suscripción.
});
```

### Editar

```ts
const aplicado = await editor.edit([
  { range: { start: { line: 1, column: 1 }, end: { line: 1, column: 6 } }, newText: 'hola' },
]);
```

Las coordenadas son **base 1** en línea y en columna.

`edit()` devuelve `false` si el documento cambió entre que lo leíste y que
escribiste: los cambios se aplican contra `document.version`, y con dos saltos de
proceso de por medio alguien tipeando no es un caso raro. Es la única respuesta
honesta que un modelo sin espejo puede dar; la alternativa es pisar lo que
alguien acaba de escribir. **Manejá el `false`**: releé y reintentá.

Los `edits` van como una sola operación, así que sus rangos se refieren todos al
documento previo, el orden entre ellos no importa, y queda un solo paso de
deshacer.

---

## Temas

Un tema no necesita código. Se declara en el manifest y apunta a un JSON:

```json
"contributes": {
  "themes": [
    { "id": "nord", "label": "Nord", "uiTheme": "dark", "path": "./themes/nord.json" }
  ]
}
```

```json
{
  "colors": {
    "background": "#2e3440",
    "foreground": "#eceff4",
    "accent": "#88c0d0"
  },
  "tokenColors": [{ "token": "comment", "foreground": "#8b97ab", "fontStyle": "italic" }]
}
```

`colors` es **parcial**: lo que no pisás se hereda del `uiTheme` que declaraste,
así que un tema que sólo cambia el acento sigue siendo legible. Las claves son
los tokens de `tokens.css` sin el prefijo `--color-`.

`tokenColors` habla **scopes de Monaco** (`comment`, `string`, `keyword`), no de
TextMate. Monaco no usa TextMate; soportarlo requiere WASM y una excepción de
CSP, y quedó anotado como RF-113.

Los colores tienen que ser hex de 3, 6 u 8 dígitos. Cualquier otra cosa se
descarta: sin eso, un valor como `red; position: fixed` se escribiría tal cual en
el `style` del documento.

Se elige con `window.colorTheme` en las settings. `window.theme` sigue decidiendo
claro contra oscuro, y gana si el tema elegido no está instalado.

> **Tu tema no pasa por la compuerta de contraste de RNF-22.** El IDE la corre
> sobre su tema de fábrica; el tuyo se aplica tal como viene. Verificá vos los
> 4.5:1.

---

## Qué **no** hay

Decirlo explícitamente es parte de la documentación:

- **No hay namespace de settings.** Podés declarar `contributes.configuration` en
  el manifest, pero la API de esta etapa no tiene con qué leerlo. No lo declares
  hasta que exista.
- **No hay UI propia.** Una extensión no puede dibujar un panel ni un webview.
  Aporta comandos, ítems de status bar y temas.
- **No hay acceso al filesystem.** Ni a `node:fs` de forma útil: todo lo
  privilegiado pasa por el main, que valida contra el workspace.
- **No hay `require('electron')`.** El host corre sin la superficie de Electron a
  propósito ([ADR-0003](../adr/0003-extension-host-aislado.md)).
- **No podés hablarle al renderer.** Todo pasa por el main, que es lo que permite
  hacer cumplir las capabilities.

---

## Si tu extensión crashea

El host se reinicia solo en menos de 2 segundos y el IDE sigue andando
(RF-907). Después de tres crashes seguidos el host se rinde y el IDE queda sin
extensiones, pero usable.

Tu `activate` puede lanzar sin miedo a tumbar nada: esa extensión queda marcada
como fallida con su motivo, y las demás siguen funcionando.

---

[Índice de la documentación](../README.md) · [ADR-0025](../adr/0025-forma-de-la-api-de-extensiones.md) · [ADR-0026](../adr/0026-broker-unico-y-pull-del-documento-activo.md)
