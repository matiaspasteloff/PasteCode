# Progreso de los planes

[← Planes de ejecución](./README.md)

> Lo actualiza la sesión que ejecuta cada etapa. Es lo primero que lee la siguiente.

## Estado

| #   | Etapa                                      | Estado    | PR  |
| --- | ------------------------------------------ | --------- | --- |
| 0   | Informe y planes                           | hecha     | —   |
| 1   | Hardening de Electron                      | en curso  | —   |
| 2   | Instalador y releases multiplataforma      | pendiente | —   |
| 3   | Modelo de confianza                        | pendiente | —   |
| 4   | Deuda barata, tipografías e idioma         | pendiente | —   |
| 5   | Diseño I: estructura                       | pendiente | —   |
| 6   | Diseño II: superficies nuevas              | pendiente | —   |
| 7   | Emulador de Android I: control             | pendiente | —   |
| 8   | Emulador de Android II: pantalla y modelos | pendiente | —   |
| 9   | IDE I: lenguaje y búsqueda                 | pendiente | —   |
| 10  | IDE II: Git, debug e IA                    | pendiente | —   |
| 11  | Cierre de la Fase 5                        | pendiente | —   |

Estados válidos: `pendiente`, `en curso`, `hecha`, `hecha con criterios abiertos`, `bloqueada`.

## Entorno

> Lo llena la etapa 1, en su tarea 0, y lo corrige cualquier etapa que encuentre algo distinto. La idea es que nadie redescubra qué corre en el contenedor de la nube.

Antes de cualquier comando, dos variables. El contenedor trae **Node 22** primero en el `PATH`, y el repo pide `>=24` (`engines`); hay un Node 24 instalado al lado. Y ESLint se queda sin heap con el límite por omisión:

```bash
export PATH=/opt/node24/bin:$PATH
export NODE_OPTIONS=--max-old-space-size=8192
```

| Comando                          | ¿Corre en la nube? | Notas                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile` | sí                 | 4–15 s con el store caliente. Con Node 22 avisa `Unsupported engine` y sigue. **Con la caché de Electron fría, la descarga del binario falla a veces** con `AssertionError [ERR_ASSERTION]: assert(!this.paused)` en el `postinstall` de `apps/desktop`; volver a correr `pnpm install` lo resuelve                                                                                                                                                                            |
| `pnpm check`                     | sí, con más heap   | ~1 min 45 s. Sin `NODE_OPTIONS=--max-old-space-size=8192`, `eslint .` muere a los ~60 s con `FATAL ERROR: Ineffective mark-compacts near heap limit` (exit 134)                                                                                                                                                                                                                                                                                                                |
| `pnpm format:check`              | sí                 | ~8 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `pnpm knip`                      | sí                 | ~3 s. Deja un _configuration hint_ (`src/renderer/main.tsx` es una entrada redundante en `knip.jsonc`) que no falla                                                                                                                                                                                                                                                                                                                                                            |
| `pnpm coverage`                  | sí                 | ~40 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `pnpm build`                     | sí                 | ~10 s sin caché de Turbo                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `pnpm test:e2e`                  | sí, con `xvfb-run` | `xvfb-run -a pnpm test:e2e`, ~90 s. Línea base: 63 pasan y 1 se saltea (el del asar, que pide un build empaquetado). **Si quedó un `apps/desktop/release/win-unpacked/` de un `pnpm package`, ese test deja de saltearse e intenta lanzar el `.exe` en Linux: `Process failed to launch!`.** Borrá `release/` antes de correr el E2E                                                                                                                                           |
| `pnpm package`                   | no (sólo a medias) | Por Turbo falla con `self-signed certificate in certificate chain`: Turbo filtra las variables de entorno y `NODE_EXTRA_CA_CERTS`, que apunta al CA del proxy de la nube, no llega a electron-builder. Corriendo el script del paquete sin Turbo (`pnpm --filter @pastecode/desktop package`) llega a armar `release/win-unpacked/` y falla en el NSIS con `spawn wine ENOENT`: no hay Wine. Un `electron-builder --linux --dir` sí debería andar; ver las notas de la etapa 1 |

## Notas por etapa

Cada etapa agrega su sección acá abajo, con este formato:

```markdown
### Etapa N — nombre

**Criterios de aceptación:** cuáles se cumplieron y cuáles quedaron abiertos, con el motivo.

**Lo que salió distinto de lo previsto:** qué decía el plan y qué hubo que hacer en cambio. Incluye toda API que el plan nombraba y no existía.

**Lo que la etapa siguiente tiene que saber.**

**Pendiente del autor:** lo que sólo se puede verificar a mano.
```
