# ADR-0006: Usar electron-vite como herramienta de build

## Estado

`Aceptado`

**Fecha:** 2026-08-15

## Contexto

Una app de Electron no es un bundle, son tres con requisitos incompatibles:

| Target       | Formato                                 | Externals                         | Entorno          |
| ------------ | --------------------------------------- | --------------------------------- | ---------------- |
| **main**     | CommonJS                                | `electron` y los builtins de Node | Node             |
| **preload**  | CommonJS obligatorio si `sandbox: true` | `electron`                        | Contexto aislado |
| **renderer** | ESM, con HMR en desarrollo              | ninguno: todo se bundlea          | Chromium         |

Además el renderer necesita un dev server con HMR, y el main necesita reiniciarse
cuando cambia su propio código.

Armar esto a mano son tres configuraciones de Vite o de tsc coordinadas entre sí,
más el manejo de `externals` de Electron —que es la fuente clásica de un build que
compila perfecto y falla al arrancar—, más el orquestador que reinicia el main
cuando cambia. Nada de eso es interesante ni específico de este proyecto.

El paso 8 de la [guía](../00-guia-paso-a-paso.md) pide "renderer con Vite y React",
sin fijar la herramienta.

## Decisión

Usar **electron-vite 5** como herramienta de build de `apps/desktop`, con una sola
configuración para los tres targets.

## Alternativas consideradas

| Opción                          | Pros                                                                                                            | Contras                                                                                                                   | Por qué no                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Tres configs de Vite a mano** | Cero dependencias nuevas; control total                                                                         | Hay que escribir y mantener el manejo de externals, el reinicio del main y el orden de build                              | Es reimplementar electron-vite peor. El costo no se paga una vez: se paga cada vez que Electron o Vite cambian algo   |
| **Electron Forge**              | Es la herramienta oficial; integra build y empaquetado                                                          | Trae su propio empaquetador, que se pisa con electron-builder; su integración con Vite es más nueva y menos usada         | Ya decidimos electron-builder por la calidad de sus instaladores NSIS. Meter dos empaquetadores es peor que meter uno |
| **Webpack**                     | Maduro; mucha documentación de Electron lo usa                                                                  | Configuración mucho más larga; dev server más lento; es la opción que el ecosistema está dejando atrás                    | El costo de configuración es exactamente lo que este ADR busca evitar                                                 |
| **electron-vite** ✅            | Una config para los tres targets; externals y formatos correctos por defecto; HMR y reinicio del main resueltos | Una dependencia más; ata la versión de Vite a la que su peer soporte (ver [ADR-0009](./0009-pinear-typescript-y-vite.md)) | —                                                                                                                     |

## Consecuencias

- ✅ Los tres targets se construyen con `electron-vite build` y una sola configuración de ~40 líneas.
- ✅ El preload sale en CommonJS, que es lo que `sandbox: true` requiere, sin que haya que acordarse.
- ✅ `pnpm dev` levanta el dev server con HMR del renderer y reinicia el main al cambiarlo.
- ⚠️ La versión de Vite queda atada al peer de electron-vite. Hoy eso significa quedarse en Vite 7 mientras el último es el 8; está registrado en [ADR-0009](./0009-pinear-typescript-y-vite.md).
- ⚠️ Los paquetes del workspace hay que excluirlos explícitamente del `externalizeDepsPlugin`, o el `.exe` instalado falla con un `Cannot find module` que en desarrollo no aparece nunca.
- ❌ Se cierra la puerta a configuraciones de bundling muy exóticas sin salirse de la herramienta. No hay ninguna a la vista.
