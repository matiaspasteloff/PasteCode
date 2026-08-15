# ADR-0004: Usar Zustand con stores chicos por dominio para el estado del renderer

## Estado

`Aceptado`

**Fecha:** 2026-08-15

## Contexto

El renderer de un IDE tiene estado compartido que no encaja en el árbol de componentes. El workspace abierto lo necesitan la barra lateral, el título de la ventana y la barra de estado. Las pestañas abiertas las necesitan la tira de pestañas, el editor y el árbol de archivos (para marcar el archivo activo). El tema lo necesita todo. Y casi nada de eso tiene una relación padre-hijo con el resto.

Además, buena parte de ese estado llega **por IPC**, o sea de forma asíncrona y desde afuera de React. Alguien tiene que decidir dónde vive la llamada, dónde queda el error para que la UI lo muestre, y cómo se evita que dos componentes pidan lo mismo dos veces.

Las restricciones que ya están fijadas:

- La [convención de React](../convenciones/codigo.md#reglas-de-react) prohíbe `useEffect` para derivar estado y exige separar los componentes de presentación de los que tienen lógica.
- El renderer corre sandboxeado y sin acceso al sistema operativo, así que **todo** el estado que no sea puramente visual empieza en un canal de IPC.
- [RNF-01](../04-requerimientos-no-funcionales.md#performance) pide un arranque por debajo de 1,5s, y el árbol de archivos se re-renderiza con cada tecla en el futuro filtro. Lo que importa no es el peso de la librería, sino **poder suscribirse a una porción del estado** en vez de a todo.
- El proyecto ya tiene una regla dura contra dependencias no justificadas.

## Decisión

**Zustand, con un store chico por dominio en `renderer/stores/`.** Un store por workspace, uno por pestañas, uno por tema. No un store global con todo adentro.

Cada store expone su estado y las acciones que lo modifican, incluidas las que llaman al IPC. Los componentes se suscriben con un selector, así que un cambio en el tema no re-renderiza el árbol de archivos.

```typescript
export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspace: null,
  isOpening: false,
  error: null,
  open: async () => {
    set({ isOpening: true, error: null });
    const result = await window.pastecode.invoke('workspace:open', {});
    // ...
  },
}));
```

Que el error del IPC quede en el store —y no lanzado desde un `catch` de componente— es lo que hace que "mostrar el `userMessage`" sea una propiedad del estado y no algo que cada pantalla resuelva a su manera.

## Alternativas consideradas

| Opción                                      | Pros                                                                                                        | Contras                                                                                                                                                                                                  | Por qué no                                                                                                 |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Context + `useReducer`**                  | Cero dependencias; es React puro                                                                            | Todo consumidor de un contexto se re-renderiza ante cualquier cambio del contexto. Con el árbol de archivos virtualizado eso es exactamente lo que no se puede pagar; la salida son N contextos anidados | La solución sin dependencia termina siendo más código y peor performance                                   |
| **Store propio con `useSyncExternalStore`** | Cero dependencias, y es la primitiva que Zustand usa por debajo                                             | Unas 150 líneas de plomería —suscripción, selectores, comparación superficial, tipado genérico— que hay que testear y mantener, para llegar a lo mismo                                                   | Reescribir una librería de 95KB empaquetados no es una victoria de independencia, es deuda con otro nombre |
| **Redux Toolkit**                           | Ecosistema enorme, DevTools de viaje en el tiempo, patrones conocidos                                       | Mucho más peso y mucha más ceremonia (slices, thunks, provider) para un estado que son tres objetos chicos                                                                                               | Resuelve problemas de escala que este renderer no tiene                                                    |
| **Jotai / Recoil (atómicos)**               | Granularidad todavía más fina                                                                               | El modelo atómico brilla cuando el estado es un grafo de dependencias derivadas; acá es estado plano con acciones asíncronas                                                                             | Más conceptos por unidad de problema                                                                       |
| **Elegida: Zustand** ✅                     | 95KB empaquetados, sin provider, suscripción por selector, las acciones asíncronas viven al lado del estado | Una dependencia más; sin provider, el estado es de módulo y hay que tenerlo en cuenta al testear                                                                                                         | —                                                                                                          |

**Datos de la dependencia** (verificados con `pnpm view` el 2026-08-15, como pide la regla 4 de `CLAUDE.md`): `zustand@5.0.15`, último release **2026-08-13**, **95.173 bytes** sin comprimir. Sin dependencias propias.

## Consecuencias

- ✅ Un componente se suscribe sólo a lo que usa. Cambiar el tema no re-renderiza el árbol de archivos, que es la diferencia que se va a notar cuando el árbol tenga 5.000 nodos.
- ✅ Las llamadas de IPC viven en el store, junto al `isLoading` y al `error` que produce. Los tres estados que el [DoD](../convenciones/definition-of-done.md) exige manejar —carga, error y vacío— salen de un solo lugar en vez de repetirse por pantalla.
- ✅ Sin provider: los stores se importan donde hagan falta y no hay un árbol de contextos que mantener.
- ⚠️ Un store por dominio es una convención, no algo que la librería imponga. Nada impide que alguien meta todo en uno; lo que lo evita es la revisión.
- ⚠️ Al no haber provider, el estado es de módulo y **persiste entre tests** del mismo archivo. Los tests de componente tienen que resetear el store que tocan.
- ❌ Se cierra la puerta a las DevTools de viaje en el tiempo de Redux. Zustand tiene un middleware de devtools si algún día hace falta, pero no se activa ahora.
