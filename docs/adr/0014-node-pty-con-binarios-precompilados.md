# ADR-0014: Usar `@lydell/node-pty` con prebuilds por plataforma en vez del `node-pty` de Microsoft

## Estado

`Aceptado`

**Fecha:** 2026-08-15

## Contexto

[RF-301 a RF-305](../03-requerimientos-funcionales.md#terminal-integrada) piden una terminal integrada de verdad: el shell del sistema, redimensionable, con múltiples instancias y sin dejar procesos huérfanos. Eso obliga a un **pseudoterminal**, no a un `child_process`. La diferencia no es de comodidad: sin un PTY, el shell detecta que su salida no es una consola y desactiva colores, prompt interactivo y edición de línea, y un `vim` o un `htop` directamente no funcionan.

En el mundo de Node hay una sola implementación: `node-pty`, de Microsoft, que es la que usa VS Code. El problema no es la librería, es **cómo se distribuye**: es un módulo nativo en C++ y el paquete oficial no publica binarios precompilados para Electron. Instalarlo implica compilarlo, y compilar un addon nativo para Electron en la máquina de quien clona el repositorio significa `node-gyp`, Python, y en Windows las Build Tools de Visual Studio. Para un proyecto de portfolio cuyo criterio de éxito incluye que alguien más pueda clonarlo y correr `pnpm install`, eso es inaceptable.

Hay además una restricción de tamaño encima: [RNF-05](../04-requerimientos-no-funcionales.md#performance) fija el instalador en 120MB y la Etapa 2 lo dejó en 110MB.

## Decisión

**`@lydell/node-pty`, pineado en `1.1.0`, con los prebuilds distribuidos como `optionalDependencies` por plataforma.**

El fork mantiene la API de `node-pty` sin cambios —`spawn`, `onData`, `onExit`, `resize`, `kill`— y sólo cambia cómo llega el binario: en vez de compilar, publica un paquete por plataforma (`@lydell/node-pty-win32-x64` y cinco más) y los declara como opcionales. npm y pnpm instalan únicamente el que corresponde. No hay `postinstall`, no hay descarga en tiempo de instalación y no hay compilador.

El binario es **N-API**, así que su ABI no depende de la versión de Node ni de la de Electron: actualizar Electron no obliga a recompilar nada.

En el empaquetado va con `asarUnpack`: un `.node` adentro del asar no se puede cargar, porque el sistema operativo necesita un archivo real en disco para mapearlo.

## Alternativas consideradas

| Opción                                               | Pros                                                                                                                                           | Contras                                                                                                                                                                                                                                                         | Por qué no                                                                                                           |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **`node-pty` oficial (Microsoft), 1.1.0**            | Es el original y el que usa VS Code. Cero intermediarios entre nosotros y quien lo mantiene                                                    | Sin prebuilds: `pnpm install` exige Build Tools de Visual Studio en Windows. Y el tarball pesa **64MB** desempaquetado, contra los 120MB de techo de RNF-05                                                                                                     | Rompe "clonar y que ande", que es un criterio de salida del proyecto y no una comodidad                              |
| **`@homebridge/node-pty-prebuilt-multiarch` 0.14.1** | Release reciente (2026-07-23), mantenimiento activo, un solo paquete para todas las plataformas                                                | Trae los binarios con `prebuild-install`, o sea un **`postinstall` que descarga de la red**. `pnpm-workspace.yaml` bloquea los scripts de instalación por defecto a propósito, así que habría que agregar una excepción; y un install sin red deja de funcionar | Un `postinstall` que baja un binario es la superficie de supply chain que el bloqueo de scripts existe para no tener |
| **`@lydell/node-pty@1.2.0-beta.15`**                 | Es lo que apunta el dist-tag `latest`, y es de hace una semana                                                                                 | Es una **beta**. Y su prebuild de Windows pesa 12,3MB desempaquetado contra los 11 de la estable                                                                                                                                                                | Que `latest` apunte a una beta es del publicador, no una recomendación. Se pinea la última estable                   |
| **`child_process` sin PTY**                          | Sin dependencias nativas de ningún tipo                                                                                                        | No es una terminal. Sin PTY el shell desactiva colores y prompt, `resize` no existe (RF-303 no se puede cumplir) y ningún programa de pantalla completa anda                                                                                                    | No cumple el requerimiento                                                                                           |
| **Elegida: `@lydell/node-pty@1.1.0`** ✅             | `pnpm install` sin compilador ni red. Sólo baja el binario de la plataforma que se está usando. N-API, así que sobrevive a actualizar Electron | La última estable es de 2025-01, o sea que el fork no se toca hace más de un año. Es una capa más entre nosotros y Microsoft                                                                                                                                    | —                                                                                                                    |

## Consecuencias

- ✅ `git clone && pnpm install && pnpm dev` funciona en una máquina limpia, sin Build Tools ni Python.
- ✅ Actualizar Electron no requiere recompilar el addon: el binario es N-API.
- ✅ El paquete instalado ocupa **0,42MB de binario** de verdad (`conpty.node` y `conpty_console_list.node`). Los otros 10MB del tarball son símbolos de depuración `.pdb`, que `electron-builder.yml` excluye explícitamente del instalador.
- ⚠️ **La estable del fork es de enero de 2025.** [La convención de dependencias](../convenciones/seguridad.md#dependencias) prohíbe agregar paquetes sin mantenimiento en los últimos 12 meses sin justificación explícita: ésta es la justificación. El fork no está abandonado —hay 18 betas de la 1.2 publicadas, la última de esta semana—, lo que pasa es que la rama estable no necesitó cambios. Se revisa al actualizar Electron, que es cuando un módulo nativo se rompe.
- ⚠️ **`kill(signal)` lanza en Windows.** No es un detalle del fork sino de conpty, que no tiene señales, y obliga a que el supervisor bifurque por plataforma. Es también lo que hace que la redacción de RNF-10 describa sólo la mitad POSIX del comportamiento; está anotado en [seguridad.md](../convenciones/seguridad.md#procesos-hijo-y-binarios-externos).
- ❌ Se cierra la puerta a compilar el addon con flags propios. Si algún día hiciera falta —no se ve por qué—, habría que volver al paquete oficial y aceptar el costo de la toolchain.
