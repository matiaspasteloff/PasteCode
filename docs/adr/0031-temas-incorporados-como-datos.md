# ADR-0031: Los temas incorporados son datos en `packages/core`, no extensiones empaquetadas

## Estado

`Aceptado`

**Fecha:** 2026-08-20

## Contexto

Hasta acá, PasteCode tenía dos temas —claro y oscuro— definidos como bloques de variables CSS en [`tokens.css`](../../apps/desktop/src/renderer/styles/tokens.css), más el camino de [RF-906](../03-requerimientos-funcionales.md#sistema-de-extensiones): una extensión puede aportar un tema, y `applyContributedTheme` lo aplica escribiendo variables CSS en el `<html>`.

La etapa experimental suma nueve temas de fábrica (Dracula, One Dark, Tokyo Night, Gruvbox, Monokai, Solarized Light, Solarized Dark, Catppuccin Mocha y Alto Contraste). Nueve no caben en `tokens.css`: el archivo declara cada tema como un bloque de selector, y el chequeo de `check-contrast.mjs` está escrito contra exactamente tres bloques con los mismos nombres de clave.

Hay una tentación obvia y hay que descartarla explícitamente: **empaquetar los nueve como extensiones**. El mecanismo ya existe, ya está testeado y ya tiene una extensión de ejemplo (`theme-nord`). Reusarlo suena a lo prolijo.

## Decisión

**Los nueve temas son un array de datos en `packages/core/src/theme/built-in-themes.ts`, y se aplican por el mismo camino que los temas de extensión.**

Cada tema declara el conjunto **completo** de tokens de `tokens.css`, sus 16 colores ANSI para la terminal, y sus reglas de token para Monaco. "Completo" no es una preferencia de estilo: un token que un tema no declara se hereda del claro o del oscuro de base, y ahí es donde aparecen los acentos de otra paleta mezclados con la elegida.

**Datos y no extensiones**, por tres razones concretas:

1. **Una extensión cuesta un proceso de host.** El extension host ocupa 64,5MB y dejó a RNF-04 con 3,2MB de margen (cierre de la Etapa 5). Nueve temas de fábrica no pueden depender de que ese proceso esté vivo — y menos aún el tema con el que arranca la app.
2. **No cuestan nada al arrancar.** Un array de literales en `packages/core` lo bundlea el renderer con todo lo demás. Nueve manifests en disco son nueve lecturas y nueve validaciones antes de poder pintar.
3. **El tema de fábrica no puede fallar.** Una extensión que no carga es un aviso en la status bar; un tema de fábrica que no carga es un IDE sin colores.

**Y el mismo camino de aplicación, no uno nuevo.** `applyContributedTheme` ya sabe escribir variables CSS en el `<html>` y registrar el tema en Monaco. Los incorporados entran por ahí: lo único que cambia es de dónde sale el descriptor. `window.colorTheme` ya es un `string` con el id ([schema.ts](../../packages/core/src/settings/schema.ts)), así que **el schema de settings no cambia** y los incorporados y los contribuidos comparten el mismo lookup.

**El invariante se testea.** Un test verifica que todo tema declara todas las claves — el mismo invariante que `check-contrast.mjs` ya defiende para claro y oscuro, ahora extendido a los nueve.

## Alternativas consideradas

| Opción                                                           | Pros                                                                                               | Contras                                                                                                                                                                                                        | Por qué no                                                                                                |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Nueve bloques más en `tokens.css`**                            | Cero código: es donde ya viven los dos temas actuales                                              | Once bloques de selector en un archivo, y `check-contrast.mjs` está escrito contra tres. Peor: un tema no sería un dato que se puede listar, así que el selector con preview tendría que tener su propia tabla | El selector necesita **recorrer** los temas, y un bloque de CSS no se recorre                             |
| **Nueve extensiones empaquetadas**                               | Reusa un mecanismo que ya existe y ya está testeado, y demuestra que la API de extensiones alcanza | Cuesta un proceso de host vivo para pintar la app, nueve lecturas de disco al arrancar, y ata el tema de fábrica a que una extensión cargue bien                                                               | Un tema de fábrica que no carga es un IDE sin colores. La API de extensiones ya la demuestra `theme-nord` |
| **Un mecanismo nuevo, aparte del de extensiones**                | Podría optimizarse para el caso de "ya está en memoria"                                            | Dos caminos para pintar un tema es dos lugares donde arreglar el mismo bug, y el de extensiones ya funciona                                                                                                    | `applyContributedTheme` hace exactamente lo que hace falta                                                |
| **Elegida: datos en `core`, camino de aplicación compartido** ✅ | Un array recorrible, cero costo de arranque, cero proceso extra, y el schema de settings sin tocar | Los nueve suman peso al bundle del renderer (unos pocos KB de literales) y hay que mantener el invariante de "todas las claves" con un test                                                                    | —                                                                                                         |

## Consecuencias

- ✅ El selector de temas es un `QuickPick` sobre un array, con preview en vivo al mover la selección y restauración al cancelar. No hay una segunda tabla de nombres.
- ✅ Los incorporados y los contribuidos comparten el mismo lookup y el mismo camino de aplicación: un bug de pintado se arregla una vez.
- ✅ El schema de settings no cambia. `window.colorTheme` ya era un `string` con el id.
- ✅ Los 16 colores ANSI viajan con el tema, así que la terminal deja de usar la paleta de fábrica de xterm y sigue al tema como el resto de la UI.
- ⚠️ Cada tema tiene que declarar **todas** las claves. Lo verifica un test; sin él, un tema incompleto se ve como acentos de otra paleta mezclados y nadie sabe por qué.
- ⚠️ **Solarized es notoriamente justo de contraste.** `check-contrast.mjs` se extendió para medir también los incorporados. Donde no llegaba, se ajustó `--color-muted` lo mínimo necesario en vez de bajar el umbral de RNF-22: el umbral es el requisito, la paleta es la implementación.
- ❌ Agregar un tema de fábrica es tocar `packages/core` y recompilar. Un tema que se instala sin recompilar sigue siendo el camino de las extensiones (RF-803), que no se toca.
