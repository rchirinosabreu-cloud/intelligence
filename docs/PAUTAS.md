# Pautas

Nace de la reunión del 6 de noviembre de 2026 y reemplaza los dos Excel: «PAUTA BRAIN STUDIO 2026» (por cliente y mes) y «Plantilla_control_pautas_por_marca_y_mes» (por anuncio).

## El problema

Se seguía anuncio por anuncio, con fechas distintas en cada uno, y nadie veía el gasto del cliente contra su presupuesto del mes. Resultado: 118 dólares gastados de 300 aprobados, pautas que se apagaban antes del cierre, una que siguió corriendo después de su fecha y otra programada más allá del cierre del cliente.

## Cómo funciona

- **Una pauta** es el presupuesto global de un cliente, o de una de sus marcas, en una plataforma. Puede ser mensual o específica, en pesos o dólares, y dice quién la lleva y quién paga.
- **El ciclo es el del cliente**: sale del día de corte de su contrato en Operación. No se escribe en Pautas. Sin contrato se usa el mes calendario y la pantalla lo dice.
- **El gasto se escribe mirando Meta**: una lectura es el acumulado del ciclo hasta un día. La versión actual no se conecta a Meta, como se decidió en la reunión.
- **Se gasta hasta dos días antes del cierre**, para hacer el informe con la cifra completa.
- **El ritmo se mide en el día de la lectura**: una cifra vieja no se llama «atrasada», se pide actualizarla.
- **Lo que no se gastó pasa al ciclo siguiente** y lo gastado de más se resta. Mientras falte el gasto final del ciclo anterior, ese saldo se muestra como provisional. Se puede ajustar a mano con motivo.
- **Tolerancia**: 5.000 pesos o 2 dólares arriba o abajo cuentan como gastado.
- **Las campañas son opcionales**. Sirven para saber qué corre dentro del presupuesto y para señalar una campaña activa pasada su fecha o que termina después del cierre.

## Corregir y deshacer

Todo se escribe a mano y todo se corrige. Cada corrección queda en `AdBudgetEvent` (inmutable) con quién, qué decía y qué dice, también al eliminar, y se ve en «Correcciones».

| Qué | Cómo |
|---|---|
| Cualquier dato de la pauta, también cliente y moneda | «Editar pauta» |
| Una lectura mal escrita | Lápiz en el historial; recalcula el ciclo |
| Deshacer una lectura | Eliminarla: vuelve la anterior |
| Deshacer un cierre | «Reabrir ciclo»: no borra el gasto |
| El presupuesto de un mes pasado | «Corregir presupuesto» en ese ciclo |
| El saldo que pasa | «Ajustar saldo anterior» y «Volver a la cuenta automática» |
| Pausar, terminar y reactivar | Estado en «Editar pauta» |
| Una campaña | Lápiz: se edita, se apaga o se elimina |
| Una pauta creada por error | «Eliminar pauta» en «Editar pauta» |

Lo eliminado no tiene botón de deshacer: se pide confirmación antes y sus datos quedan en el registro para reconstruirlo. Para conservar una pauta se marca como terminada.

## Carga inicial

No hay importación de los Excel. `scripts/load-ad-budgets.js` crea las pautas dichas en la reunión (`scripts/lib/adBudgetSeed.js`). Simula por defecto, escribe con `--confirmar CARGAR`, se puede repetir sin duplicar y avisa si el contrato da otro cierre. Lo incierto queda en la nota de cada pauta. Titanes y Martínez y Nájera no se cargan: en la reunión no se dijo su presupuesto.

## Avisos

| Quién | Por dónde | Cuándo |
|---|---|---|
| Quien lleva la pauta | Banda | Gasto sin actualizar por 3 días, o 1 día en los últimos 5 del ciclo. Falta el gasto final. Campaña activa pasada su fecha o que termina después del cierre. |
| Project manager de la cuenta | Campana, sin cifras | Una vez por ciclo a 5 días del cierre y una vez si la pauta se pasa. |

El aviso de la banda se cae solo al actualizar el gasto o cambiar la campaña. Más de tres avisos salen en un resumen. Sin responsable, el aviso va al área Pauta de Equipo y, si no hay nadie, al project manager. Quien no tiene acceso a Pautas no recibe avisos.

## Permisos

Casilla `pautas` en Equipo. Quien tiene Manager entra sin tocar la base (`inheritsFrom`); a quien lleva la pauta se le marca la casilla y el área Pauta.

## Lo que falta

- Leer el gasto de Meta. Ya existe la lectura para Reportes (`fetchAdsReport`), pero depende de vincular cada cuenta publicitaria y las que están en la cuenta personal de Francisco no están al alcance del usuario del sistema.
- Llevar a Cartera lo gastado con la tarjeta de Brain Studio, para cobrarlo.
- Comparar el gasto del informe con el registrado aquí.

## Verificación

- Reglas y servicio: `tests/adBudgets.test.js`, `tests/adBudgetService.test.js`, `tests/adBudgetRoutes.test.js`, `tests/adBudgetsContract.test.js`.
- Recorrido real con capturas: `node scripts/preview-ad-budgets.js --port=3848` y `node --test tests/browser/adBudgets.mjs`. Escribe en la base en memoria de la muestra, así que corre una vez por arranque.
- Las tablas de `scripts/ensure-ad-budgets-schema.js` no se han ejecutado contra PostgreSQL real al escribir esto: en esa máquina no había base disponible. La prueba de contrato solo compara sus columnas con `schema.prisma`.
