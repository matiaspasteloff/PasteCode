# ADR-0009: Fijar TypeScript en 6.0.3 y Vite en 7.3.6

## Estado

`Aceptado`

**Fecha:** 2026-08-15

## Contexto

Al montar el andamio de la Etapa 1 (2026-08-15), las últimas versiones publicadas
eran TypeScript **7.0.2** y Vite **8.2.1**. Ninguna de las dos sirve todavía, y el
motivo es el mismo en los dos casos: un peer que no las alcanzó.

**TypeScript.** `typescript-eslint@8.67.0` declara:

```json
"peerDependencies": { "typescript": ">=4.8.4 <6.1.0" }
```

Las reglas type-aware de ESLint son obligatorias según
[convenciones/codigo.md](../convenciones/codigo.md#herramientas-de-calidad), y son
las que hacen cumplir buena parte del resto del documento —`no-floating-promises`,
`no-explicit-any` con información de tipos, las prohibiciones de aserciones—. Con
TypeScript 7 instalado, typescript-eslint no arranca o se comporta de forma no
soportada. Es elegir entre la última versión del compilador y el linter que hace
cumplir las convenciones. Gana el linter: el compilador nuevo no aporta nada que
este proyecto necesite hoy.

**Vite.** `electron-vite@5.0.0` ([ADR-0006](./0006-electron-vite-como-build.md))
declara:

```json
"peerDependencies": { "vite": "^5.0.0 || ^6.0.0 || ^7.0.0" }
```

Hay un efecto secundario que conviene anotar porque no es evidente:
`@vitejs/plugin-react@6` pide `vite: ^8`, así que el pin de Vite arrastra también
el del plugin. Se usa `@vitejs/plugin-react@5.2.0`, que es la última que soporta
Vite 7 **y** 8 — elegida a propósito para que la actualización futura a Vite 8 no
tenga que tocarla.

El riesgo real no es quedarse una versión atrás. Es que dentro de tres meses
alguien —una persona o un Dependabot— suba TypeScript a 7 sin contexto, el lint
type-aware empiece a fallar de formas raras, y se pierda una tarde entendiendo por
qué.

## Decisión

Fijar **TypeScript en `6.0.3`** y **Vite en `7.3.6`** con versiones exactas, no
rangos, y hacer que violar los peers rompa el `install` en vez del runtime.

## Alternativas consideradas

| Opción                                                   | Pros                                                      | Contras                                                                                          | Por qué no                                                                                                  |
| -------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| **Instalar las últimas y desactivar el lint type-aware** | Versiones al día                                          | Se pierden las reglas que hacen cumplir codigo.md: quedarían como texto que nadie verifica       | Es cambiar una garantía verificada por un número de versión más alto                                        |
| **Usar rangos `^6` y `^7`**                              | Se toman parches y minors automáticamente                 | Un `^7` sobre Vite igual se sale del peer cuando salga la 8; `^6` de TypeScript se sale con la 7 | El rango no protege de nada acá: el límite que importa es el peer del otro paquete, no el semver del propio |
| **Forzar con `overrides` y peers no estrictos**          | Deja instalar lo último                                   | Silencia exactamente la señal que queremos escuchar                                              | Un conflicto de peers acá no es ruido, es la información                                                    |
| **Pin exacto + `strictPeerDependencies`** ✅             | El conflicto aparece al instalar, con el mensaje correcto | Hay que revisarlo a mano cuando los upstream se actualicen                                       | —                                                                                                           |

## Consecuencias

- ✅ Un `pnpm update` que se salga de los rangos soportados falla en el `install`, no seis pasos después con un error sin relación aparente.
- ✅ El porqué queda escrito en tres lugares que alguien va a mirar: este ADR, el bloque `//pins` de `package.json` y el comentario de `strictPeerDependencies` en `pnpm-workspace.yaml`.
- ⚠️ El proyecto queda una major atrás en dos herramientas, a propósito.
- ⚠️ Hay que revisar la condición cuando `typescript-eslint` publique soporte para TypeScript 7 y cuando `electron-vite` acepte Vite 8. **Las dos son actualizaciones de una línea más una corrida de `pnpm check`**; lo caro sería no saber por qué estaban fijadas.
- ❌ Se cierra el uso de features de TypeScript 7 y de Vite 8 hasta entonces. No hay ninguna que este proyecto necesite hoy.
