// Lo que la cuenta de cobro necesita tanto en el servidor como en la pantalla. Vive
// aquí y no en el servicio para que el formulario no arrastre código de servidor.

// El párrafo de apertura es idéntico en las cuentas de cobro reales 0366 y 0389: solo
// cambian las viñetas de debajo. Se ofrece escrito para no teclearlo cada mes.
export const RECEIVABLE_CONCEPT_DEFAULT = 'Prestación de servicios para el diseño y ejecución de estrategias de comunicación digital para la marca, con el objetivo de visibilizar, posicionar y promocionar los servicios y productos que ofrecen en las diferentes redes sociales. Este servicio incluye:';

export const RECEIVABLE_ITEM_MAX = 40;
export const RECEIVABLE_CONCEPT_MAX = 4000;
export const RECEIVABLE_ITEM_DESCRIPTION_MAX = 300;
export const RECEIVABLE_SERVICE_PERIOD_MAX = 120;

// Como lo escribe el documento real: «Cuenta de cobro No. 0389», cuatro dígitos y
// sin prefijo de letras. No es un formato nuestro, es el que ya reciben los clientes.
export const formatReceivableNumber = (number) => {
    // `Number(null)` es 0 y `Number.isInteger(0)` es true: sin este guardia una
    // obligación sin emitir se presentaría como «No. null».
    if (number === null || number === undefined || number === '') return null;
    const value = Number(number);
    return Number.isInteger(value) && value > 0 ? `No. ${String(value).padStart(4, '0')}` : null;
};
