# Nord

El tema [Nord](https://www.nordtheme.com/) para PasteCode. Es la extensión de
ejemplo de **RF-906** y **RF-803**: contribuye un tema y **no tiene código**.

## Qué demuestra

Que una extensión puede aportar algo sin ejecutar nada. No tiene `main`, así que
no tiene `activate`, así que el IDE no carga ni ejecuta un solo módulo suyo: lee
su `package.json`, lee el JSON de colores al que apunta, y listo. Un tema es un
archivo de datos, y exigirle un `activate` vacío obligaría a ejecutar código de
terceros para pintar colores.

## Cómo usarlo

```json
{
  "window": {
    "colorTheme": "nord"
  }
}
```

`window.theme` sigue decidiendo claro contra oscuro, y sigue mandando si el tema
elegido no está instalado. `window.colorTheme` elige qué paleta se pinta encima.

## Una nota sobre los colores

**No es la paleta Nord textual.** Los rojos y los violetas de la Aurora original
no llegan a 4.5:1 sobre el fondo `#2e3440` del propio Nord, así que se aclararon:
`#bf616a` → `#e08890`, `#b48ead` → `#c4a0bd`, `#d08770` → `#de9b84` donde se usan
como texto.

Vale aclararlo porque es exactamente el agujero que
[ADR-0025](../../docs/adr/0025-forma-de-la-api-de-extensiones.md) deja anotado:
un tema de terceros **no** pasa por la compuerta de contraste de RNF-22 —
`scripts/check-contrast.mjs` mide el tema de fábrica—, así que un tema instalado
se aplica tal como viene. El que se distribuye con el IDE cumple igual el mismo
umbral, por decisión y no por verificación automática.
