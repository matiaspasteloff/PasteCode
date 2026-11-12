# Convenciones · Build, release y distribución

[← Seguridad](./seguridad.md) · [Índice](../README.md) · [Definition of Done →](./definition-of-done.md)

---

## Pipeline de CI

```yaml
# .github/workflows/ci.yml — esquema
name: CI
on:
  push: { branches: [main] }
  pull_request:

jobs:
  quality: # ubuntu-latest
    - typecheck # tsc --noEmit en todos los paquetes
    - lint # eslint sin warnings; incluye import-x/no-cycle
    - format:check # prettier --check
    - knip # código y dependencias muertas
    - audit # pnpm audit --audit-level=high

  test: # ubuntu-latest, windows-latest, macos-latest
    - coverage # unitarios e integración, con los umbrales de testing.md

  e2e: # windows-latest, la plataforma primaria
    - build
    - test:e2e # la suite completa, que asume PowerShell

  smoke: # ubuntu-latest (con xvfb) y macos-latest
    - build
    - e2e/tests/smoke.spec.ts # que la app arranca, con su preload y su CSP

  build: # uses: ./.github/workflows/package.yml
    # la matriz de empaquetado de abajo

  perf-budget: # windows-latest
    - build
    - perf # RNF-01, RNF-02 y RNF-04, con presupuestos absolutos
    - upload-report # el JSON con los números, como artifact
    - comment-on-pr # comentario sticky con la tabla
```

### Empaquetado: `package.yml`

Es un workflow reutilizable (`on: workflow_call`): lo llama `ci.yml` en cada PR y `release.yml` con cada tag, así que **lo que pasa en un PR es exactamente lo que se publica**. Construye en cinco runners, uno nativo por arquitectura:

| Runner           | Arquitectura | Construye                   | Directorio desempaquetado    |
| ---------------- | ------------ | --------------------------- | ---------------------------- |
| `windows-latest` | x64          | NSIS de un click + portable | `release/win-unpacked`       |
| `windows-11-arm` | arm64        | NSIS de un click            | `release/win-arm64-unpacked` |
| `macos-latest`   | arm64        | `.dmg` + `.zip`             | `release/mac-arm64`          |
| `macos-26-intel` | x64          | `.dmg` + `.zip`             | `release/mac`                |
| `ubuntu-latest`  | x64          | AppImage + `.deb`           | `release/linux-unpacked`     |

Nativos a propósito: node-pty y ripgrep llegan como binarios precompilados en `optionalDependencies`, y pnpm instala los de la máquina en la que corre. Construir cada arquitectura donde corresponde evita toda compilación cruzada ([ADR-0034](../adr/0034-distribucion-multiplataforma-y-auto-update.md)). Las etiquetas se verificaron contra [actions/runner-images](https://github.com/actions/runner-images) en noviembre de 2026; la de macOS Intel es la que más cambia —`macos-13` ya no existe y `macos-14` se retiró— y **una etiqueta que no existe deja el job en cola para siempre**.

Cada fila: `pnpm install`, `pnpm build` (que incluye el `dist/` de la extensión `word-count`), `electron-builder <destinos> --<arch> --publish never`, y dos verificaciones:

- **`scripts/verify-package.mjs <dir> <plataforma> <arch>`** falla si al paquete le falta ripgrep, el `.node` de node-pty, `typescript-language-server/lib/cli.mjs` o alguna de las dos extensiones de ejemplo en `resources/extensions/`, y si **cualquier** binario nativo del paquete —lee las cabeceras ELF, PE y Mach-O de cada archivo— es de otra arquitectura o de otro sistema. La única excepción, por ruta exacta, es `resources/elevate.exe`: el ayudante de elevación que el NSIS de electron-builder copia siempre y que sólo existe en x86.
- **`scripts/check-installer-size.mjs <dir> <plataforma> <arch>`** mide cada instalador y deja la tabla en el resumen del job. Hace cumplir los 120MB de RNF-05 en Windows; en macOS y Linux mide y reporta.

Sube como artefacto `pastecode-<fila>` los instaladores, los `latest*.yml` que lee electron-updater y los `.blockmap` de las descargas diferenciales.

El job `perf-budget` es lo que convierte los [presupuestos de performance](../04-requerimientos-no-funcionales.md#performance) de una aspiración en una restricción real.

**Los presupuestos son absolutos y no relativos a `main`** ([ADR-0015](../adr/0015-presupuestos-absolutos-de-performance.md)): cada número se compara contra el valor del requerimiento, sin línea base y sin estado entre corridas. La medición vive en `e2e/perf/`, en su propia configuración de Playwright, separada de la suite funcional porque no verifica comportamiento sino números —y porque veinte arranques de Electron no entran en los 30 segundos de techo que `testing.md` le pone a un E2E—.

| Requerimiento | Qué corre                        | Cómo se resume           |
| ------------- | -------------------------------- | ------------------------ |
| RNF-01        | `e2e/perf/startup.perf.ts`       | p95 de 20 arranques      |
| RNF-02        | `e2e/perf/input-latency.perf.ts` | p99 de 120 pulsaciones   |
| RNF-04        | `e2e/perf/memory.perf.ts`        | una muestra              |
| RNF-05        | `check-installer-size.mjs`       | cada instalador generado |

RNF-05 se verifica en la matriz de empaquetado y no acá porque los instaladores ya existen ahí: volver a empaquetar sólo para medirlos costaría varios minutos por PR.

Los números van a tres lugares: el resumen del job —`$GITHUB_STEP_SUMMARY`—, un artifact con el JSON, y un comentario en el PR que se reescribe en cada push en vez de acumularse. Aparecen **aunque todo pase**, que es lo que hace visible una degradación que todavía esté adentro del presupuesto.

---

## Targets de distribución

Los declara `apps/desktop/electron-builder.yml`; la arquitectura la elige la línea de comandos de cada fila de la matriz, no el YAML. Los nombres siguen `PasteCode-${version}-${os}-${arch}.${ext}`, con `-setup` para NSIS y `-portable` para el portable; `${arch}` lo traduce cada destino a su convención (`x86_64` en el AppImage, `amd64` en el `.deb`).

| Plataforma    | Formato                             | Notas                                                                                          |
| ------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| Windows x64   | NSIS `-setup.exe` + `-portable.exe` | Un click, per-user, sin elevación. Se actualiza sola                                           |
| Windows arm64 | NSIS `-setup.exe`                   | Un click, per-user. **Sólo avisa** de versiones nuevas: el `latest.yml` publicado es el de x64 |
| macOS arm64   | `.dmg` + `.zip`                     | Firma ad-hoc, sin notarizar. Sólo avisa: Squirrel.Mac exige certificado                        |
| macOS x64     | `.dmg` + `.zip`                     | Ídem. Son **dos** `.dmg` y no uno universal: cada uno se construye en su runner                |
| Linux x64     | AppImage + `.deb`                   | El AppImage se actualiza solo; el `.deb` lo actualiza el gestor de paquetes                    |

La firma ad-hoc de macOS (`mac.identity: '-'`) no es una firma con certificado: es lo mínimo que Apple Silicon exige para ejecutar código nativo. Sin ella el binario arm64 no arranca; con ella, Gatekeeper igual avisa (ver el README).

---

## Auto-update

Con `electron-updater`, contra los releases de GitHub (`publish` en `electron-builder.yml`). **Nunca descarga ni instala sin que la persona lo pida**: `autoDownload` y `autoInstallOnAppQuit` están apagados, y descargar e instalar son dos canales de IPC (`update:download`, `update:install`) que sólo disparan los comandos `app.downloadUpdate` y `app.installUpdate`. El primer chequeo se hace diez segundos después de mostrar la ventana, si `update.checkOnStartup` lo permite. Sin empaquetar no hay chequeo ni red: el estado es `unsupported`.

Donde la instalación no se puede actualizar sola —macOS, Windows arm64, el portable, el `.deb`— la app avisa igual y ofrece abrir la página del release. El detalle está en [ADR-0034](../adr/0034-distribucion-multiplataforma-y-auto-update.md).

---

## Firma de código

Sin firma, Windows SmartScreen muestra una advertencia agresiva que hace que nadie instale nada. Para un proyecto de portfolio esto importa más de lo que parece.

| Opción         | Costo aprox. anual | Notas                                                                             |
| -------------- | ------------------ | --------------------------------------------------------------------------------- |
| Certificado OV | USD 200-400        | Requiere validar identidad; la reputación de SmartScreen se acumula con el tiempo |
| Certificado EV | USD 300-600        | Reputación de SmartScreen inmediata; requiere token físico                        |
| **Sin firma**  | 0                  | Advertencia de SmartScreen. Documentar en el README cómo saltearla                |

**Decisión provisional:** empezar sin firma, documentando el workaround en el README. Evaluar OV si el proyecto gana tracción. **Registrar como ADR cuando se decida.**

Mientras tanto, lo que da garantías es la **attestation de procedencia**: `release.yml` firma, con el OIDC del workflow y Sigstore, una declaración de que cada archivo del release salió de ese workflow, en ese repositorio y en ese commit. Se verifica con la CLI de GitHub:

```bash
gh attestation verify PasteCode-0.4.0-win-x64-setup.exe --repo matiaspasteloff/PasteCode
```

Y la integridad de la descarga, contra `SHA256SUMS.txt`:

```bash
sha256sum --check --ignore-missing SHA256SUMS.txt
```

---

## Proceso de release

Sin `changesets`: la versión y el changelog se escriben a mano, que para un release cada varias semanas es más simple que una herramienta más.

1. Se mergea a `main` todo lo que va en la release, con el CI en verde.
2. Se sube `version` en `apps/desktop/package.json` y se mueve la sección _Sin publicar_ de `CHANGELOG.md` a la versión nueva.
3. Se empuja el tag `vX.Y.Z` (o `vX.Y.Z-beta.N`) sobre ese commit.
4. `release.yml` verifica que el tag coincida con la versión del `package.json` —si no, falla antes de construir—, llama a `package.yml`, genera `SHA256SUMS.txt` y la attestation, y crea el release **en borrador**. Un tag con sufijo se marca como prerelease.
5. Se revisa el borrador y se reemplazan las notas generadas por unas legibles. Publicarlo es lo que lo hace visible para electron-updater.

En el release hay lugar para un `latest*.yml` por sistema: se publica el `latest.yml` de Windows x64, los dos `latest-mac.yml` unidos en uno (`scripts/merge-update-info.mjs`) y el `latest-linux.yml`.

---

## Reglas de release

- Nada se publica con el CI en rojo.
- Todo release lleva notas **legibles por un humano**, no un volcado de commits.
- Los prereleases van con sufijo `-beta.N`; sólo los ofrece el canal `beta` (`update.channel`), que elige el usuario y nunca un workspace.
- El auto-update **nunca** descarga ni instala sin consentimiento explícito del usuario.

---

[← Seguridad](./seguridad.md) · [Índice](../README.md) · [Definition of Done →](./definition-of-done.md)
