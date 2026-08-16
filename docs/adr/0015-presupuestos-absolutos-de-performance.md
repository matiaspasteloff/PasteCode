# ADR-0015: Presupuestos de performance absolutos, no relativos a `main`

## Estado

`Aceptado`

**Fecha:** 2026-08-15

## Contexto

[04-requerimientos-no-funcionales.md](../04-requerimientos-no-funcionales.md#performance) fija cinco presupuestos con números concretos —1,5s de arranque, 16ms de latencia, 400MB de RAM, 120MB de instalador— y agregaba una regla de cómo hacerlos cumplir:

> Si un PR degrada RNF-01 en más de 10%, el pipeline falla.

Esa regla no es la misma cosa que los números. Dice **comparar contra una medición anterior**, y eso trae todo un aparato: guardar el resultado de cada corrida de `main`, recuperarlo en el PR, decidir contra cuál comparar cuando la rama está desactualizada, y decidir qué hacer cuando `main` no tiene medición porque el job falló.

El paso 25 de la [guía](../00-guia-paso-a-paso.md#etapa-3--herramientas-de-desarrollo) obliga a elegir, porque es donde esto se implementa de verdad.

Dos hechos que pesan más que la elegancia de la idea:

- **El runner del CI es compartido.** Dos corridas del mismo commit en `windows-latest` dan tiempos de arranque que difieren bastante más del 10%. Una regla del 10% sobre esa base falla PRs que no tocaron nada y deja pasar los que sí.
- **Las regresiones que importan son acumulativas.** Diez PRs que empeoran el arranque un 9% cada uno lo duplican, y ninguno de los diez falla la regla.

## Decisión

**Los presupuestos son absolutos. El CI compara cada número contra el valor del requerimiento, no contra `main`.**

El job `perf-budget` corre en `windows-latest` —la plataforma primaria de [RNF-26](../04-requerimientos-no-funcionales.md)— y falla si algún número supera su presupuesto. No guarda estado entre corridas, no consulta ramas y no necesita una línea base.

Lo que sí hace es **mostrar los números siempre**: en el resumen del job y en un comentario del PR que se reescribe en cada push. El objetivo es que la tendencia se vea, aunque el pipeline no la vigile. Una regresión del 20% que sigue adentro del presupuesto no rompe nada y **debería** verse igual: es información, no un error.

Los percentiles absorben la varianza del runner mejor que un promedio: RNF-01 se resume como p95 de 20 arranques y RNF-02 como p99 de 120 pulsaciones. Sin eso, un presupuesto absoluto sobre una sola corrida sería tan ruidoso como la regla que reemplaza.

RNF-05 se verifica aparte, en el job que genera el `.exe`: volver a empaquetar en el job de performance sólo para medir el tamaño costaría varios minutos por PR.

## Alternativas consideradas

| Opción                                               | Pros                                                                                                                               | Contras                                                                                                                                                                                                   | Por qué no                                                                            |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Relativo a `main`, umbral del 10%**                | Detecta una regresión antes de que llegue al presupuesto. Es lo que decía el documento                                             | Necesita persistir mediciones entre corridas. Y sobre un runner compartido, el 10% está adentro del ruido: falla PRs inocentes y deja pasar culpables                                                     | Mide la varianza del runner, no la del código                                         |
| **Relativo con umbral más ancho (30%)**              | Menos falsos positivos                                                                                                             | Un umbral que aguanta el ruido ya es más ancho que casi cualquier regresión real. Y sigue sin ver lo acumulativo                                                                                          | Un guardián que no detecta nada es peor que ninguno, porque da tranquilidad falsa     |
| **Sólo reportar, sin fallar nunca**                  | Cero falsos positivos; los números quedan igual                                                                                    | El checkpoint de la Etapa 3 es "el CI reporta números en cada PR", pero el compromiso del proyecto son los presupuestos. Un número que nadie hace cumplir se incumple en silencio                         | RNF-05 ya fallaba el build por tamaño; no hay razón para que el arranque sea distinto |
| **Correr en un runner dedicado**                     | La comparación relativa pasaría a ser confiable                                                                                    | Es infraestructura pagada y mantenida para un proyecto de portfolio                                                                                                                                       | Desproporcionado                                                                      |
| **Elegida: absolutos, con percentiles y reporte** ✅ | Sin estado entre corridas. El número que falla es el mismo que dice el requerimiento. Los percentiles absorben el ruido del runner | No avisa de una degradación que siga adentro del presupuesto: pasar de 400ms a 1.400ms de arranque no falla nada. Lo compensa el reporte, que lo deja a la vista, pero eso depende de que alguien lo mire | —                                                                                     |

## Consecuencias

- ✅ El CI no necesita guardar ni recuperar mediciones: el job es autocontenido.
- ✅ El número que falla el pipeline es **exactamente** el que está escrito en el requerimiento. No hay que traducir "degradó 12%" a "¿estamos adentro del presupuesto o no?".
- ✅ Los números aparecen en cada PR aunque todo pase, así que la tendencia se ve.
- ⚠️ **Una degradación que quede adentro del presupuesto no falla nada.** Es el costo real de esta decisión. La mitigación es el reporte, y depende de que alguien lo lea; si en algún momento el margen se vuelve chico, la respuesta es bajar el presupuesto, no volver a la comparación relativa.
- ⚠️ Los presupuestos se miden en el runner del CI, que es más lento que el [hardware de referencia](../04-requerimientos-no-funcionales.md#performance). Un número que pasa ahí pasa de sobra en una máquina real; al revés no vale.
- ❌ Se cierra la puerta a detectar regresiones por comparación. Si alguna vez hace falta, lo que corresponde es un runner dedicado y no un umbral porcentual sobre uno compartido.
