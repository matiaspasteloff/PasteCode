# Convenciones · Git y control de versiones

[← Código](./codigo.md) · [Índice](../README.md) · [Testing →](./testing.md)

---

## Estrategia de branching

Trunk-based con branches de vida corta. Trabajás solo, así que Git Flow es overhead innecesario, pero los PRs valen la pena igual: dejan un registro de decisiones legible para quien evalúe el repo.

```
main ─────●──────●──────●──────●──────▶  (siempre deployable, protegida)
           \    /        \    /
            ●──●          ●──●            feature branches (< 3 días de vida)
```

### Reglas

- `main` está protegida. Nada de push directo, ni siquiera propio.
- Todo cambio entra por PR, incluso siendo el único dev. **El PR es documentación.**
- Las branches viven menos de 3 días. Si una feature es más grande, se parte.
- Se mergea con squash. El historial de `main` es lineal y legible.
- Se borra la branch tras el merge.

---

## Nombres de branch

```
<tipo>/<issue>-<descripción-corta>
```

| Tipo | Uso |
|---|---|
| `feat` | Funcionalidad nueva |
| `fix` | Corrección de bug |
| `refactor` | Cambio interno sin alterar comportamiento |
| `perf` | Mejora de performance |
| `docs` | Sólo documentación |
| `test` | Sólo tests |
| `chore` | Build, deps, tooling |

```
✅ feat/42-terminal-split-panes
✅ fix/58-file-watcher-leak-on-windows
❌ mi-branch
❌ arreglos
```

---

## Conventional Commits — obligatorio

```
<tipo>(<scope>): <descripción en imperativo, minúscula, sin punto final>

[cuerpo opcional explicando el porqué]

[footer opcional: BREAKING CHANGE, Closes #42]
```

**Scopes válidos:** `editor`, `terminal`, `lsp`, `dap`, `git`, `fs`, `ext-host`, `ui`, `core`, `ipc`, `build`, `ci`

```bash
# ✅ BIEN
feat(terminal): add split pane support

Los usuarios necesitan ver output de build y ejecutar comandos a la vez.
Implementado con un layout de grilla que soporta hasta 4 paneles.

Closes #42

# ✅ BIEN
fix(fs): prevent file watcher leak when closing workspace

El watcher de chokidar no se cerraba al cambiar de workspace, dejando
handles abiertos. En sesiones largas esto llegaba al límite de file
descriptors del SO.

Closes #58

# ❌ MAL
arreglé cosas
WIP
update
```

Se valida automáticamente con `commitlint` en el hook `commit-msg`.

---

## Reglas de commit

1. Un commit = un cambio lógico completo. Nada de "WIP" en `main`.
2. Todo commit deja el proyecto en estado compilable. Nada de commits rotos, ni siquiera en branches.
3. Nada de commits que sólo formatean mezclados con cambios de lógica. Separados siempre.
4. Se hace rebase de la feature branch sobre `main` antes del PR, nunca merge de `main` hacia adentro.

---

## Plantilla de PR

Guardar como `.github/pull_request_template.md`.

```markdown
## Qué cambia
<!-- Descripción en una o dos frases -->

## Por qué
<!-- Contexto: qué problema resuelve. Linkear el issue -->

## Cómo probarlo
<!-- Pasos concretos para verificar manualmente -->

## Checklist
- [ ] Los tests pasan localmente (`pnpm test`)
- [ ] Sin warnings de lint (`pnpm lint`)
- [ ] Agregué tests para el comportamiento nuevo
- [ ] Actualicé la documentación si cambió una API pública
- [ ] Verifiqué que no degrada los presupuestos de performance
- [ ] Probé manualmente en Windows
- [ ] Si es una decisión arquitectónica, escribí el ADR
```

El checklist completo de cierre está en [Definition of Done](./definition-of-done.md).

---

## Versionado

SemVer estricto: `MAJOR.MINOR.PATCH`

| Incremento | Cuándo |
|---|---|
| **MAJOR** | Breaking change en la API de extensiones o en el formato de settings |
| **MINOR** | Funcionalidad nueva retrocompatible |
| **PATCH** | Correcciones de bugs |

El `CHANGELOG.md` se genera automáticamente desde los conventional commits con `changesets`.

---

[← Código](./codigo.md) · [Índice](../README.md) · [Testing →](./testing.md)
