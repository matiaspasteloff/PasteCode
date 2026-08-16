# Convenciones · Build, release y distribución

[← Seguridad](./seguridad.md) · [Índice](../README.md) · [Definition of Done →](./definition-of-done.md)

---

## Pipeline de CI

```yaml
# .github/workflows/ci.yml — esquema
name: CI
on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - typecheck # tsc --noEmit en todos los paquetes
      - lint # eslint sin warnings permitidos; incluye la
        # detección de ciclos vía import-x/no-cycle
      - format:check # prettier --check
      - dead-code # knip
      - audit # pnpm audit --audit-level=high

  test:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    steps:
      - test:unit
      - test:integration
      - coverage:check

  e2e:
    runs-on: windows-latest # plataforma primaria
    steps:
      - build
      - test:e2e

  build:
    runs-on: windows-latest
    steps:
      - package # genera el .exe
      - check-installer-size # RNF-05: falla si supera 120MB

  perf-budget:
    runs-on: windows-latest
    steps:
      - build
      - perf # RNF-01, RNF-02 y RNF-04, con presupuestos absolutos
      - upload-report # el JSON con los números, como artifact
      - comment-on-pr # comentario sticky con la tabla
```

El job `perf-budget` es lo que convierte los [presupuestos de performance](../04-requerimientos-no-funcionales.md#performance) de una aspiración en una restricción real.

**Los presupuestos son absolutos y no relativos a `main`** ([ADR-0015](../adr/0015-presupuestos-absolutos-de-performance.md)): cada número se compara contra el valor del requerimiento, sin línea base y sin estado entre corridas. La medición vive en `e2e/perf/`, en su propia configuración de Playwright, separada de la suite funcional porque no verifica comportamiento sino números —y porque veinte arranques de Electron no entran en los 30 segundos de techo que `testing.md` le pone a un E2E—.

| Requerimiento | Qué corre                        | Cómo se resume            |
| ------------- | -------------------------------- | ------------------------- |
| RNF-01        | `e2e/perf/startup.perf.ts`       | p95 de 20 arranques       |
| RNF-02        | `e2e/perf/input-latency.perf.ts` | p99 de 120 pulsaciones    |
| RNF-04        | `e2e/perf/memory.perf.ts`        | una muestra               |
| RNF-05        | Paso del job `build`             | el `.exe` recién generado |

RNF-05 se verifica en el job del instalador y no acá porque el `.exe` ya existe ahí: volver a empaquetar sólo para medirlo costaría varios minutos por PR.

Los números van a tres lugares: el resumen del job —`$GITHUB_STEP_SUMMARY`—, un artifact con el JSON, y un comentario en el PR que se reescribe en cada push en vez de acumularse. Aparecen **aunque todo pase**, que es lo que hace visible una degradación que todavía esté adentro del presupuesto.

---

## Targets de distribución

| Plataforma      | Formato              | Notas                                              |
| --------------- | -------------------- | -------------------------------------------------- |
| Windows x64     | NSIS `.exe`          | Instalador con opción per-user, sin requerir admin |
| Windows arm64   | NSIS `.exe`          | —                                                  |
| macOS universal | `.dmg`               | Notarizado                                         |
| Linux x64       | `.AppImage` + `.deb` | —                                                  |

---

## Firma de código

Sin firma, Windows SmartScreen muestra una advertencia agresiva que hace que nadie instale nada. Para un proyecto de portfolio esto importa más de lo que parece.

| Opción         | Costo aprox. anual | Notas                                                                             |
| -------------- | ------------------ | --------------------------------------------------------------------------------- |
| Certificado OV | USD 200-400        | Requiere validar identidad; la reputación de SmartScreen se acumula con el tiempo |
| Certificado EV | USD 300-600        | Reputación de SmartScreen inmediata; requiere token físico                        |
| **Sin firma**  | 0                  | Advertencia de SmartScreen. Documentar en el README cómo saltearla                |

**Decisión provisional:** empezar sin firma, documentando el workaround en el README. Evaluar OV si el proyecto gana tracción. **Registrar como ADR cuando se decida.**

---

## Proceso de release

1. Se mergea a `main` todo lo que va en la release.
2. `changesets version` calcula la versión y genera el `CHANGELOG.md`.
3. Se crea el tag `vX.Y.Z`.
4. El workflow de release construye para las 4 plataformas y publica en GitHub Releases.
5. `electron-updater` detecta la nueva versión desde GitHub Releases y ofrece actualizar.

---

## Reglas de release

- Nada se publica con el CI en rojo.
- Todo release lleva notas **legibles por un humano**, no un volcado de commits.
- Los prereleases van con sufijo `-beta.N` y en un canal de update separado.
- El auto-update **nunca** se instala sin consentimiento explícito del usuario.

---

[← Seguridad](./seguridad.md) · [Índice](../README.md) · [Definition of Done →](./definition-of-done.md)
