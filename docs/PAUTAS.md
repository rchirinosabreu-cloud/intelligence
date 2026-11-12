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
- **El gasto de Meta es una lectura más**, marcada «Meta» en el historial (`AdSpendReading.source`): una por día, que se actualiza durante el día. **Lo que una persona escribió ese día manda** y Meta no lo pisa hasta el día siguiente; si no coincide (más allá de la tolerancia), la pauta lo dice y ofrece «Usar la de Meta».
- **El gasto final sigue siendo de una persona.** Durante cinco días tras el cierre la plataforma lee el ciclo que terminó, sin cerrarlo; «Registrar» el gasto final lo trae ya escrito.
- **Gasto sin pauta:** lo que gastó en 30 días y no está en ninguna pauta se ve en el tablero («N campañas gastan sin pauta»). Se liga a su pauta (viene elegida si una sola lleva su nombre) o se marca «No es de una pauta» (de la agencia, o de un cliente que paga por su cuenta). Las dos cosas se deshacen.
- **Solo lee el gasto.** La lectura no pausa campañas ni cambia nada en Meta. Un fallo de Meta no borra lo que había: queda dicho en la cuenta o en la pauta.
- **Lo que no resuelve:** la hora de corte de cada cuenta es la de su zona horaria en Meta, y una cuenta en otra zona puede diferir un día en los bordes del ciclo.

## Ajustar el presupuesto en Meta (12 de noviembre de 2026)

Rodny: «no tiene sentido ajustar gasto en la plataforma si en Meta va a tener otro». En «Gasto en Meta» → «Ver y ajustar el presupuesto en Meta» se ve lo que Meta tiene configurado ahora en cada campaña ligada y, con «Editar pautas», se cambia.

- **El presupuesto vive en la campaña o en sus conjuntos de anuncios, nunca en los dos** (referencia de Meta). Si la campaña no tiene, se ven y se ajustan sus conjuntos. Diario o total: Meta no deja cambiar el tipo, solo el valor.
- **Lo que gastaría**: diario por los días que faltan hasta el límite de gasto del ciclo (contando hoy si el gasto se leyó hoy, o desde el día siguiente a la última lectura), total por lo que le queda; si un total sigue después del límite, solo la parte de estos días. Pausada no gasta. Es una estimación con lo configurado en Meta.
- **El tope** (Rodny: «no lo deja»): un cambio que sube lo que la pauta gastaría por encima de lo que queda del ciclo (más la tolerancia) no se hace, y la ventana dice el máximo para esa campaña. Si el cliente aprobó más, se sube primero el presupuesto de la pauta. Bajar siempre se deja, aunque la pauta ya vaya pasada.
- **Antes de cambiar se vuelve a leer Meta**: si alguien cambió el presupuesto allá mientras tanto, no se pisa y se pide revisar. Después se lee otra vez para confirmar.
- **Queda en «Correcciones»** con el antes, el después y quién (`AdBudgetEvent`, acción `META_PRESUPUESTO`). Si Meta no acepta, se dice con sus palabras y no se anota nada.
- **Lo cambiado en el Administrador de anuncios** no lo puede impedir la plataforma, pero lo ve: cada lectura (cada dos horas o con «Actualizar ahora») guarda lo que la pauta gastaría con lo configurado (`AdBudgetCycle.metaForecast`). Si se pasaría, la fila lo dice en rojo y a quien la lleva le llega a la banda (`PAUTA_META`). Bajarlo desde la plataforma rehace ese cálculo y el aviso se cae en el acto; bajarlo en Meta, en la siguiente lectura.
- **Solo cambia el valor del presupuesto** (`daily_budget` o `lifetime_budget`, en pesos enteros o centavos de dólar): no pausa, no crea, no borra campañas y no cambia fechas.
- **Comprobado contra Meta real el 12 de noviembre de 2026**, con autorización de Rodny: (1) la plataforma leyó los presupuestos de las campañas de las 18 cuentas activas, diarios y totales, de campaña y de conjunto; la llave tiene permiso de anunciar en todas y de administrar en casi todas. (2) En las 9 cuentas con una campaña con presupuesto, Meta revisó un cambio sin aplicarlo (`validate_only`, con el mismo valor) y dijo que lo aceptaría, también en dólares. (3) Un cambio real: el presupuesto total del conjunto «MENSAJES NOVIEMBRE 2026» de «BRAIN CON CONVERSACIONES NOV 2026» subió de 240.000 a 240.100 y volvió a 240.000.
- **Meta acepta un cambio de presupuesto cada 30 segundos en el mismo conjunto o campaña** (código 613). Devolver el cambio del ensayo falló hasta esperar medio minuto; la ventana lo dice en palabras si pasa.

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
| Una campaña marcada «No es de una pauta» | Ligarla a una pauta la vuelve a contar |
| Un presupuesto cambiado en Meta | Se vuelve a cambiar desde la misma ventana; queda en «Correcciones» |

Lo eliminado no tiene botón de deshacer: se pide confirmación antes y sus datos quedan en el registro para reconstruirlo. Para conservar una pauta se marca como terminada.

## Carga inicial

No hay importación de los Excel. `scripts/load-ad-budgets.js` crea las pautas dichas en la reunión (`scripts/lib/adBudgetSeed.js`). Simula por defecto, escribe con `--confirmar CARGAR`, se puede repetir sin duplicar y fija el corte propio de Endova (15), Bonsai y Multi-K (19). Lo incierto queda en la nota de cada pauta. Titanes y Martínez y Nájera no se cargan: en la reunión no se dijo su presupuesto.

## Avisos

| Quién | Por dónde | Cuándo |
|---|---|---|
| Quien lleva la pauta | Banda | Gasto sin actualizar por 3 días, o 1 día en los últimos 5 del ciclo. Falta el gasto final. Campaña activa pasada su fecha o que termina después del cierre. |
| Quien lleva la pauta | Banda (salmón) | Lo configurado en Meta haría pasarse lo aprobado: lo gastado más lo que gastarían las campañas ligadas hasta el límite de gasto supera el presupuesto (más la tolerancia). Sale de la lectura de Meta de cada dos horas, así que también avisa de lo que alguien cambió en el Administrador de anuncios. «Revisar presupuesto en Meta» abre la ventana para bajarlo. |
| Project manager de la cuenta | Campana, sin cifras | Una vez por ciclo a 5 días del cierre y una vez si la pauta se pasa. |

El aviso de la banda se cae solo al actualizar el gasto o cambiar la campaña. Más de tres avisos salen en un resumen. Sin responsable, el aviso va al área Pauta de Equipo y, si no hay nadie, al project manager. La banda pide actualizar el gasto o cerrar el ciclo, así que solo le llega a quien tiene «Editar pautas»; la campana del project manager pide solo ver Pautas.

## Permisos

Dos niveles (Rodny, 12 de noviembre de 2026: «ver y editar, siendo editar el ajuste en Meta»):

- **Ver**: casilla `pautas` en Equipo. Quien tiene Manager entra sin tocar la base (`inheritsFrom`). Ve el tablero, el historial y el presupuesto en Meta, y puede pedir «Actualizar ahora».
- **Editar**: casilla «Editar pautas y ajustar presupuestos en Meta» (`pautas_editar`). Crear, corregir y eliminar pautas, actualizar el gasto, cerrar ciclos, ligar campañas y ajustar el presupuesto en Meta. **Nadie la trae por su cargo, tampoco un administrador** (`EXPLICIT_KEYS`): se marca persona por persona, como la liga. El servidor lo comprueba en cada ruta que escribe (`requireAdBudgetEdit`); la pantalla solo esconde los botones.

Al desplegarlo nadie tiene «Editar pautas» hasta que un administrador se la marque en Equipo: a quien lleva la pauta (Keila) y a quien deba ajustar presupuestos.

## Lo que falta

- Llevar a Cartera lo gastado con la tarjeta de Brain Studio, para cobrarlo.
- Comparar el gasto del informe con el registrado aquí.

## Verificación

- Reglas y servicio: `tests/adBudgets.test.js`, `tests/adBudgetService.test.js`, `tests/adBudgetRoutes.test.js`, `tests/adBudgetsContract.test.js`, `tests/adBudgetMeta.test.js`, `tests/adBudgetMetaService.test.js`, `tests/adBudgetMetaBudgets.test.js`; los dos niveles en `tests/platformModules.test.js`.
- Recorrido real con capturas: `node scripts/preview-ad-budgets.js --port=3848 --hoy=2026-11-06` y `node --test tests/browser/adBudgets.mjs`. La muestra vive en ese día y simula Meta con cuentas, campañas y presupuestos de mentira (`POST /api/__preview/permisos?editar=0` la deja solo viendo); el recorrido escribe en su base en memoria, así que corre una vez por arranque.
- Las tablas de `scripts/ensure-ad-budgets-schema.js` no se han ejecutado contra PostgreSQL real al escribir esto: en esa máquina no había base disponible. La prueba de contrato solo compara sus columnas con `schema.prisma`.
