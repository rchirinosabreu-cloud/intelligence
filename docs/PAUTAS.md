# Pautas

Nace de la reunión del 6 de noviembre de 2026 y reemplaza los dos Excel: «PAUTA BRAIN STUDIO 2026» (por cliente y mes) y «Plantilla_control_pautas_por_marca_y_mes» (por anuncio).

## El problema

Se seguía anuncio por anuncio, con fechas distintas en cada uno, y nadie veía el gasto del cliente contra su presupuesto del mes. Resultado: 118 dólares gastados de 300 aprobados, pautas que se apagaban antes del cierre, una que siguió corriendo después de su fecha y otra programada más allá del cierre del cliente.

## Cómo funciona

- **Una pauta** es el presupuesto global de un cliente, o de una de sus marcas, en una plataforma. Puede ser mensual o específica, en pesos o dólares, y dice quién la lleva y quién paga.
- **El ciclo es el del cliente**: sale del día de corte propio de la pauta y, si no lo tiene, del contrato en Operación. Es propio porque en producción todos los contratos tienen corte 1, y moverlo cambiaría el semáforo y los avisos de Operación. Sin ninguno de los dos se usa el mes calendario y la pantalla lo dice.
- **Una sola pauta, dos entradas:** desde la ficha operativa y la página del cliente se añade una pauta, se actualiza el gasto y se edita, con los mismos formularios del módulo. Es el mismo dato: lo que cambia en un lado se ve en el otro. Solo lo ve quien tiene acceso a Pautas; quien no, sigue viendo la ficha sin ese bloque.
- **El gasto es el acumulado del ciclo hasta un día**. Si la pauta tiene campañas de Meta ligadas, la plataforma lo lee sola (ver «Conexión con Meta»); si no, lo escribe quien la lleva mirando Meta.
- **Se gasta hasta dos días antes del cierre**, para hacer el informe con la cifra completa.
- **El ritmo se mide en el día de la lectura**: una cifra vieja no se llama «atrasada», se pide actualizarla.
- **Lo que no se gastó pasa al ciclo siguiente** y lo gastado de más se resta. Mientras falte el gasto final del ciclo anterior, ese saldo se muestra como provisional. Se puede ajustar a mano con motivo.
- **Tolerancia**: 5.000 pesos o 2 dólares arriba o abajo cuentan como gastado.
- **Las campañas son opcionales**. Sirven para saber qué corre dentro del presupuesto y para señalar una campaña activa pasada su fecha o que termina después del cierre.

## Conexión con Meta (12 de noviembre de 2026)

Rodny: «quiero ver la forma en que pueda conectar esto con las pautas reales en Meta». La lectura de prueba de ese día, solo de consulta, encontró las 19 cuentas publicitarias que ve la llave de la plataforma (`META_SYSTEM_USER_TOKEN`), incluida la de Francisco Villa, y Multik, Endova y FoobeSpain coincidían con lo escrito a mano.

- **Una pauta se liga a campañas, no a cuentas.** Una cuenta no es un cliente: la de Francisco Villa lleva Pablo Hoff, New Pueblito, Martínez y Nájera y Brain, y Wine Summit corre dentro de la cuenta de Wine & Wonder. En «Gasto en Meta» → «Ligar campañas» la plataforma propone las que llevan el nombre del cliente o de la marca, o están en una cuenta con ese nombre sin nombrar a otra marca; una persona confirma. Una campaña es de una sola pauta y en su moneda.
- **La plataforma lee sola cada dos horas**, de 6:00 a 22:00 de Bogotá, todos los días, y con «Actualizar ahora». Primero las cuentas y lo que gastó cada campaña en los últimos 30 días (`AdMetaAccount`, `AdMetaCampaign`); después, el gasto de cada pauta ligada en los días de su ciclo, sumando sus campañas.
- **En una pauta ligada manda Meta** (Rodny, 12 de noviembre de 2026: «si ya está ceñido a Meta, eso no crearía cifras diferentes?»). El gasto es una lectura marcada «Meta» (`AdSpendReading.source`), una por día, y no se escribe a mano mientras Meta lo lea bien (hoy o ayer): desaparece «Actualizar gasto» y el servidor lo rechaza (`metaSpendLock`, `manualSpendProblem`). Si Meta falla o lleva días sin leer, vuelve el botón para no quedarse sin dato; en cuanto Meta lee otra vez, su cifra queda como la vigente. Lo escrito a mano antes no se borra: queda en el historial.
- **El gasto final** de una pauta ligada es el de Meta leído hasta el cierre: «Confirmar con Meta» lo registra tal cual y cierra el ciclo; otra cifra se rechaza.
- **Las campañas son las de Meta.** En una pauta ligada no se crean campañas a mano; las anotadas antes se conservan como «Campañas anotadas a mano». Los avisos de campaña («termina después del cierre», «no hay ninguna activa») salen del estado y la fecha de fin que Meta tiene en cada campaña o conjunto.
- **El gasto final sigue siendo de una persona.** Durante cinco días tras el cierre la plataforma lee el ciclo que terminó, sin cerrarlo; «Registrar» el gasto final lo trae ya escrito.
- **Gasto sin pauta:** lo que gastó en 30 días y no está en ninguna pauta se ve en el tablero («N campañas gastan sin pauta»). Se liga a su pauta (viene elegida si una sola lleva su nombre) o se marca «No es de una pauta» (de la agencia, o de un cliente que paga por su cuenta). Las dos cosas se deshacen.
- **Solo lee el gasto.** La lectura no pausa campañas ni cambia nada en Meta. Un fallo de Meta no borra lo que había: queda dicho en la cuenta o en la pauta.
- **Lo que no resuelve:** la hora de corte de cada cuenta es la de su zona horaria en Meta, y una cuenta en otra zona puede diferir un día en los bordes del ciclo.

## El presupuesto aprobado vive en la ficha del cliente, y en Meta se configura (13 de noviembre de 2026)

Rodny: «el presupuesto de pauta debe vivir en la ficha operativa del cliente y eso debe estar en Meta y reflejarse en pauta, si hay una inconsistencia entonces que Bria haga el aviso» y «solamente se puede aprobar desde el Meta Business y la plataforma reflejarlo». Tres cifras, cada una en su sitio:

- **Lo aprobado** está en el contrato del cliente, en la ficha operativa: `ClientContract.adBudgets`, una entrada por plataforma y marca con su moneda y su cifra por ciclo («Pauta aprobada por el cliente»). La pauta de Pautas **no tiene presupuesto propio**: lo lee de ahí (`approvedAdBudgetFor`), «Nueva pauta» elige una de las aprobadas en el contrato y `AdBudget.amount` es solo su espejo (`applyContractApprovals` lo actualiza al guardar la ficha, con una línea en «Correcciones», `APROBADO_FICHA`). Una pauta cuya marca no está en el contrato sigue con la cifra que traía, en amarillo, y dice que falta agregarla a la ficha. Un ciclo ya cerrado conserva la cifra con la que se cerró. Se retiraron «Corregir presupuesto» por ciclo y los campos de «quién lo aprobó» del día anterior.
- **Lo configurado** está en Meta: el presupuesto de cada campaña o conjunto. **La plataforma no lo cambia** («el tope está establecido en Meta, no se puede manipular desde la plataforma»): «Ver el presupuesto en Meta» solo lo muestra, con lo que gastaría cada campaña hasta el límite de gasto. El ajuste desde la plataforma con tope se construyó, se probó contra Meta real y se retiró el mismo día; `metaAdBudgetClient` solo lee.
- **Lo gastado** lo lee Meta cada dos horas (sección anterior).

Cuando no cuadran, la plataforma avisa (ver «Avisos»): si con lo configurado en Meta la pauta gastaría más de lo aprobado, la fila lo dice en rojo y a quien la lleva le llega a la banda; se corrige en el Administrador de anuncios de Meta o, si el cliente aprobó más, en la ficha. Lo que sobra de un mes pasa al siguiente (la dirección, 13 de noviembre de 2026: «por eso este mes se está pasando el gasto, porque no se gastó el mes pasado»), así que lo aprobado del ciclo incluye ese saldo y Meta debería reflejarlo.

- **Carga de las 8 pautas**: `scripts/load-ad-budget-approvals.js` copia la cifra y la moneda de cada pauta vigente al contrato de su cliente si no la tiene (simula por defecto; `--confirmar CARGAR` escribe; no toca las pautas). Un cliente sin contrato vigente se señala y se completa a mano en la ficha.
- **Google y TikTok** quedan en stand by: la ficha acepta la plataforma, pero hoy solo hay pautas de Meta.
- **Comprobado contra Meta real el 12 de noviembre de 2026** (lectura y, antes de retirarlo, el ajuste): la llave lee los presupuestos de las 18 cuentas activas. Meta acepta un cambio de presupuesto cada 30 segundos por objeto (código 613).

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
| Las campañas de Meta de una pauta | «Cambiar campañas»; soltarlas no borra las lecturas ya escritas |
| El presupuesto aprobado | En la ficha operativa del cliente («Pauta aprobada por el cliente»): la pauta lo toma de ahí y queda en «Correcciones» |
| El saldo que pasa de un ciclo a otro | Lo calcula la plataforma (aprobado menos gastado) y la ventana lo muestra; «Acuerdo de saldo distinto» registra otra cifra solo si se acordó con el cliente, con motivo |
| Una campaña marcada «No es de una pauta» | Ligarla a una pauta la vuelve a contar |
| El presupuesto de una campaña en Meta | En el Administrador de anuncios de Meta; la plataforma lo refleja en la siguiente lectura |

Lo eliminado no tiene botón de deshacer: se pide confirmación antes y sus datos quedan en el registro para reconstruirlo. Para conservar una pauta se marca como terminada.

## Carga inicial

No hay importación de los Excel. `scripts/load-ad-budgets.js` crea las pautas dichas en la reunión (`scripts/lib/adBudgetSeed.js`). Simula por defecto, escribe con `--confirmar CARGAR`, se puede repetir sin duplicar y fija el corte propio de Endova (15), Bonsai y Multi-K (19). Lo incierto queda en la nota de cada pauta. Titanes y Martínez y Nájera no se cargan: en la reunión no se dijo su presupuesto.

## Avisos

| Quién | Por dónde | Cuándo |
|---|---|---|
| Quien lleva la pauta | Banda | Gasto sin actualizar por 3 días, o 1 día en los últimos 5 del ciclo. Falta el gasto final. Campaña activa pasada su fecha o que termina después del cierre. |
| Quien lleva la pauta | Banda (salmón) | Lo configurado en Meta haría pasarse lo aprobado: lo gastado más lo que gastarían las campañas ligadas hasta el límite de gasto supera el presupuesto (más la tolerancia). Sale de la lectura de Meta de cada dos horas, así que también avisa de lo que alguien cambió en el Administrador de anuncios. «Revisar presupuesto en Meta» abre la ventana que lo muestra; se baja en Meta o se sube lo aprobado en la ficha. |
| Project manager de la cuenta | Campana, sin cifras | Una vez por ciclo a 5 días del cierre y una vez si la pauta se pasa. |

El aviso de la banda se cae solo al actualizar el gasto o cambiar la campaña. Más de tres avisos salen en un resumen. Sin responsable, el aviso va al área Pauta de Equipo y, si no hay nadie, al project manager. La banda pide actualizar el gasto o cerrar el ciclo, así que solo le llega a quien tiene «Editar pautas»; la campana del project manager pide solo ver Pautas.

## Permisos

Dos niveles (Rodny, 12 de noviembre de 2026: «ver y editar»):

- **Ver**: casilla `pautas` en Equipo. Quien tiene Manager entra sin tocar la base (`inheritsFrom`). Ve el tablero, el historial y el presupuesto en Meta, y puede pedir «Actualizar ahora».
- **Editar**: casilla «Editar pautas» (`pautas_editar`). Crear, corregir y eliminar pautas, actualizar el gasto cuando Meta no lo trae, cerrar ciclos y ligar campañas. El presupuesto aprobado se cambia en la ficha del cliente (Operación) y el de cada campaña en Meta, no aquí. **Nadie la trae por su cargo, tampoco un administrador** (`EXPLICIT_KEYS`): se marca persona por persona, como la liga. El servidor lo comprueba en cada ruta que escribe (`requireAdBudgetEdit`); la pantalla solo esconde los botones.

Al desplegarlo nadie tiene «Editar pautas» hasta que un administrador se la marque en Equipo: a quien lleva la pauta (Keila).

## Lo que falta

- Llevar a Cartera lo gastado con la tarjeta de Brain Studio, para cobrarlo.
- Comparar el gasto del informe con el registrado aquí.

## Verificación

- Reglas y servicio: `tests/adBudgets.test.js`, `tests/adBudgetService.test.js`, `tests/adBudgetRoutes.test.js`, `tests/adBudgetsContract.test.js`, `tests/adBudgetMeta.test.js`, `tests/adBudgetMetaService.test.js`, `tests/adBudgetMetaBudgets.test.js`; los dos niveles en `tests/platformModules.test.js`.
- Recorrido real con capturas: `node scripts/preview-ad-budgets.js --port=3848 --hoy=2026-11-06` y `node --test tests/browser/adBudgets.mjs`. La muestra vive en ese día y simula Meta con cuentas, campañas y presupuestos de mentira (`POST /api/__preview/permisos?editar=0` la deja solo viendo); el recorrido escribe en su base en memoria, así que corre una vez por arranque.
- Las tablas de `scripts/ensure-ad-budgets-schema.js` no se han ejecutado contra PostgreSQL real al escribir esto: en esa máquina no había base disponible. La prueba de contrato solo compara sus columnas con `schema.prisma`.