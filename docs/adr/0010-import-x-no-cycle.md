# ADR-0010: Detectar dependencias circulares con `import-x/no-cycle` en vez de madge

## Estado

`Aceptado`

**Fecha:** 2026-08-15

## Contexto

La documentación se contradecía a sí misma en este punto.

[convenciones/codigo.md](../convenciones/codigo.md#herramientas-de-calidad) y
[convenciones/build-y-release.md](../convenciones/build-y-release.md#pipeline-de-ci)
mandaban usar **madge** (`madge --circular`) como job propio del CI, y
[02-arquitectura.md](../02-arquitectura.md#regla-de-dependencias) lo mencionaba
como el mecanismo que hace fallar el CI ante un ciclo.

Pero [convenciones/seguridad.md](../convenciones/seguridad.md#dependencias) dice:

> Prohibido agregar dependencias sin mantenimiento en los últimos 12 meses sin
> justificación explícita.

El último release de madge es de **2024-08-05**: dos años. La regla lo prohíbe, y
la justificación explícita tendría que ser "no hay alternativa", que no es cierto.

La necesidad de fondo no está en discusión: un ciclo entre módulos rompe la
regla de dependencias de la arquitectura, y en un monorepo aparece sin que nadie
lo note hasta que algo se importa como `undefined` en runtime.

## Decisión

Detectar los ciclos con la regla **`no-cycle` de `eslint-plugin-import-x@4.17.1`**
(último release 2026-06-28), configurada con `maxDepth: Infinity`, y eliminar
tanto la dependencia `madge` como el job `circular-deps` del CI.

## Alternativas consideradas

| Opción                                   | Pros                                                                              | Contras                                                                                   | Por qué no                                                                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Mantener madge**                       | Es lo que la documentación ya pedía; su salida en grafo es linda para un README   | Dos años sin mantenimiento; es una dependencia y un job de CI para una sola verificación  | Viola la regla de dependencias de seguridad.md, y hacer una excepción en el primer commit del proyecto marca un precedente malo |
| **`eslint-plugin-import`** (el original) | El más conocido                                                                   | Su mantenimiento viene irregular y su soporte de TypeScript depende de un resolver aparte | `import-x` es el fork activo justamente por esto                                                                                |
| **`dpdm`**                               | Específico para esto, con soporte de TypeScript                                   | Mismo problema estructural: otra dependencia y otro job                                   | No resuelve nada que la regla de ESLint no resuelva ya                                                                          |
| **`import-x/no-cycle`** ✅               | Corre dentro del ESLint que ya está en el CI; marca el import exacto en el editor | Es más lento que las reglas normales de lint, porque tiene que recorrer el grafo          | —                                                                                                                               |

## Consecuencias

- ✅ Se elimina una dependencia y un job de CI en vez de agregarlos. La verificación sale gratis dentro de `pnpm lint`.
- ✅ El ciclo se marca en el editor, sobre la línea del `import` que lo cierra, en el momento de escribirlo. madge sólo lo reportaba en el CI, con el commit ya hecho.
- ✅ El mismo plugin aporta `no-self-import` y el ordenamiento de imports, que antes no tenían dueño.
- ⚠️ `no-cycle` es de las reglas más caras de ESLint. Hoy es imperceptible; si el lint se vuelve lento cuando el proyecto crezca, la salida es acotar `maxDepth`, no sacar la regla.
- ⚠️ Se pierde la visualización en grafo de madge. No se usaba para nada.
- ❌ Se cierra la posibilidad de detectar ciclos en archivos que ESLint no procesa. Hoy ESLint procesa todo el código fuente del repo.
