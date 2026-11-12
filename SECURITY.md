# Política de seguridad

## Cómo reportar una vulnerabilidad

**No abras un issue público.** Un issue se ve antes de que exista el arreglo, y una vulnerabilidad de un IDE —que abre repositorios ajenos y ejecuta procesos— le sirve a cualquiera que la lea.

Reportala en privado desde la pestaña **Security** del repositorio, con **Report a vulnerability** (_private vulnerability reporting_ de GitHub). El reporte queda visible sólo para quien lo escribe y para el mantenedor.

Lo que más ayuda incluir:

- La versión de PasteCode y el sistema operativo.
- Qué puede lograr quien la explote: leer archivos, ejecutar código, saltear una capability de extensión, otra cosa.
- Los pasos para reproducirla, o un repositorio o extensión mínimos que la disparen.

Es un proyecto mantenido por una persona. El objetivo es acusar recibo en una semana y decir en ese mismo plazo si se confirma y qué se va a hacer; no hay un acuerdo de nivel de servicio detrás.

## Versiones con arreglos

PasteCode está en `0.x`. Los arreglos de seguridad salen **sólo sobre la última versión publicada**: no se mantienen ramas de versiones anteriores, y la forma de recibir un arreglo es actualizar.

| Versión                    | Recibe arreglos de seguridad |
| -------------------------- | ---------------------------- |
| La última publicada        | ✅                           |
| Cualquier versión anterior | ❌                           |

## Qué se considera dentro del modelo

El modelo de amenazas —qué se protege, de quién y con qué— está en [`docs/convenciones/seguridad.md`](./docs/convenciones/seguridad.md), con la parte de extensiones en [Modelo de amenazas — extensiones](./docs/convenciones/seguridad.md#modelo-de-amenazas--extensiones). Hoy, dos límites conocidos y documentados ahí:

- **Las extensiones corren con Node completo.** Las capabilities limitan la API de PasteCode, no el proceso. Se resuelve en el [plan de la etapa 3](./docs/planes/etapa-03-confianza.md).
- **No hay confianza de workspace todavía.** Abrir un repositorio puede lanzar el servidor de lenguaje de su `node_modules`. Mismo plan.

Un reporte sobre cualquiera de los dos sirve igual si muestra un camino que el plan no contempla.
