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
      - typecheck        # tsc --noEmit en todos los paquetes
      - lint             # eslint sin warnings permitidos
      - format:check     # prettier --check
      - circular-deps    # madge --circular
      - dead-code        # knip
      - audit            # npm audit --audit-level=high

  test:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    steps:
      - test:unit
      - test:integration
      - coverage:check

  e2e:
    runs-on: windows-latest   # plataforma primaria
    steps:
      - build
      - test:e2e

  perf-budget:
    runs-on: windows-latest
    steps:
      - measure-startup   # falla si supera RNF-01 +10%
      - measure-bundle    # falla si supera RNF-05
```

El job `perf-budget` es lo que convierte los [presupuestos de performance](../04-requerimientos-no-funcionales.md#performance) de una aspiración en una restricción real.

---

## Targets de distribución

| Plataforma | Formato | Notas |
|---|---|---|
| Windows x64 | NSIS `.exe` | Instalador con opción per-user, sin requerir admin |
| Windows arm64 | NSIS `.exe` | — |
| macOS universal | `.dmg` | Notarizado |
| Linux x64 | `.AppImage` + `.deb` | — |

---

## Firma de código

Sin firma, Windows SmartScreen muestra una advertencia agresiva que hace que nadie instale nada. Para un proyecto de portfolio esto importa más de lo que parece.

| Opción | Costo aprox. anual | Notas |
|---|---|---|
| Certificado OV | USD 200-400 | Requiere validar identidad; la reputación de SmartScreen se acumula con el tiempo |
| Certificado EV | USD 300-600 | Reputación de SmartScreen inmediata; requiere token físico |
| **Sin firma** | 0 | Advertencia de SmartScreen. Documentar en el README cómo saltearla |

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
