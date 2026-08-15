# Convenciones · Definition of Done

[← Build y release](./build-y-release.md) · [Índice](../README.md)

---

Una tarea está terminada cuando **todo** esto es cierto. No es una lista de deseos: si algo no se cumple, la tarea sigue abierta.

## Código

- [ ] Cumple todas las [reglas de código](./codigo.md)
- [ ] Cero warnings de ESLint y de TypeScript
- [ ] No quedaron `console.log` ni código comentado
- [ ] Ningún archivo supera 400 líneas, ninguna función supera 50

## Tests

- [ ] Hay tests unitarios para la lógica nueva, y de integración si cruza procesos
- [ ] Todos los tests pasan localmente y en CI, en las 3 plataformas
- [ ] La cobertura no bajó respecto de `main`
- [ ] Si esto arregla un bug, existe un test que fallaba antes del fix

## Verificación

- [ ] Se probó manualmente en Windows (plataforma primaria)
- [ ] No se degradó ningún [presupuesto de performance](../04-requerimientos-no-funcionales.md#performance)
- [ ] Se verificó el criterio de aceptación del requerimiento asociado

## Experiencia de usuario

- [ ] Los estados de carga, error y vacío están manejados en la UI
- [ ] La feature es operable enteramente por teclado ([RNF-21](../04-requerimientos-no-funcionales.md#usabilidad-y-accesibilidad))
- [ ] Los mensajes de error son legibles y accionables por un humano ([RNF-25](../04-requerimientos-no-funcionales.md#usabilidad-y-accesibilidad))
- [ ] Ningún string está hardcodeado en la UI ([RNF-29](../04-requerimientos-no-funcionales.md#compatibilidad))

## Documentación

- [ ] Se actualizó la documentación si cambió una API pública
- [ ] Se escribió el [ADR](../adr/) si hubo una decisión arquitectónica
- [ ] Los commits siguen [Conventional Commits](./git.md#conventional-commits--obligatorio)

---

> **Sobre trabajar solo:** es tentador saltear este checklist cuando no hay nadie revisando. No lo hagas. El checklist *es* el revisor. Y el historial de Git que produce es exactamente lo que un evaluador va a mirar.

---

[← Build y release](./build-y-release.md) · [Índice](../README.md)
