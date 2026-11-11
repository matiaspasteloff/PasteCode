# Progreso de los planes

[← Planes de ejecución](./README.md)

> Lo actualiza la sesión que ejecuta cada etapa. Es lo primero que lee la siguiente.

## Estado

| #   | Etapa                                      | Estado    | PR  |
| --- | ------------------------------------------ | --------- | --- |
| 0   | Informe y planes                           | hecha     | —   |
| 1   | Hardening de Electron                      | pendiente | —   |
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

| Comando                          | ¿Corre en la nube? | Notas |
| -------------------------------- | ------------------ | ----- |
| `pnpm install --frozen-lockfile` | _sin verificar_    |       |
| `pnpm check`                     | _sin verificar_    |       |
| `pnpm format:check`              | _sin verificar_    |       |
| `pnpm knip`                      | _sin verificar_    |       |
| `pnpm coverage`                  | _sin verificar_    |       |
| `pnpm build`                     | _sin verificar_    |       |
| `pnpm test:e2e`                  | _sin verificar_    |       |
| `pnpm package`                   | _sin verificar_    |       |

## Notas por etapa

Cada etapa agrega su sección acá abajo, con este formato:

```markdown
### Etapa N — nombre

**Criterios de aceptación:** cuáles se cumplieron y cuáles quedaron abiertos, con el motivo.

**Lo que salió distinto de lo previsto:** qué decía el plan y qué hubo que hacer en cambio. Incluye toda API que el plan nombraba y no existía.

**Lo que la etapa siguiente tiene que saber.**

**Pendiente del autor:** lo que sólo se puede verificar a mano.
```
