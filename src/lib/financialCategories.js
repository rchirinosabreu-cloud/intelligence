// Las categorías financieras, con el nombre que ve una persona. Vivían copiadas
// dentro del libro de movimientos; están aquí para que la barra de filtros y el
// libro no se separen, y para poder comprobarlas contra el enum de Prisma.
// Detalle de cada una: docs/FINANCIAL_CATEGORIES.md
export const FINANCIAL_CATEGORY_OPTIONS = Object.freeze([
    ['MEMBRESIA', 'Membresía'],
    ['SERVICIO', 'Servicio'],
    ['PAUTA', 'Pauta'],
    ['NOMINA', 'Nómina'],
    ['LOGISTICA', 'Logística'],
    ['ADMINISTRATIVO', 'Administrativo'],
    ['TAX', 'Impuestos y tasas'],
    ['FINANCIAL', 'Financiero y banco'],
    ['OPERATIVO', 'Operativo'],
    ['DONACION', 'Donaciones'],
    ['SIEMBRA', 'Siembra'],
    ['PRESTAMO', 'Préstamo']
]);

export const financialCategoryLabel = (value) =>
    FINANCIAL_CATEGORY_OPTIONS.find(([category]) => category === value)?.[1] || value;
