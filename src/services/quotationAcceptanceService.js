export class QuotationAcceptanceError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'QuotationAcceptanceError';
    this.statusCode = statusCode;
  }
}

const ensureAcceptableQuotation = (quotation, now) => {
  if (!quotation || quotation.status === 'BORRADOR') {
    throw new QuotationAcceptanceError('Propuesta no encontrada', 404);
  }
  if (quotation.status === 'APROBADA') return 'ALREADY_ACCEPTED';
  if (quotation.status !== 'ACTIVA') {
    throw new QuotationAcceptanceError('La propuesta no esta disponible para aprobacion', 409);
  }
  if (new Date(quotation.expires_at) < now) {
    throw new QuotationAcceptanceError('La propuesta esta vencida y debe ser reactivada', 409);
  }
  return 'ACCEPTABLE';
};

export const acceptQuotationBySlug = async ({ db, slug, now = new Date() }) => (
  db.$transaction(async (tx) => {
    const quotation = await tx.quotation.findUnique({ where: { uuid_slug: slug } });
    const acceptanceState = ensureAcceptableQuotation(quotation, now);
    if (acceptanceState === 'ALREADY_ACCEPTED') {
      return { quotation, alreadyAccepted: true };
    }

    const update = await tx.quotation.updateMany({
      where: {
        id: quotation.id,
        status: 'ACTIVA',
        expires_at: { gte: now }
      },
      data: {
        status: 'APROBADA',
        accepted_at: now
      }
    });

    if (update.count === 0) {
      const current = await tx.quotation.findUnique({ where: { uuid_slug: slug } });
      if (current?.status === 'APROBADA') return { quotation: current, alreadyAccepted: true };
      ensureAcceptableQuotation(current, now);
      throw new QuotationAcceptanceError('No fue posible aprobar la propuesta', 409);
    }

    const approvedQuotation = { ...quotation, status: 'APROBADA', accepted_at: now };
    const recipients = await tx.user.findMany({
      where: {
        isActive: true,
        role: { in: ['ADMIN', 'PROJECT_MANAGER'] }
      },
      select: { id: true }
    });

    if (recipients.length > 0) {
      const formattedConsecutive = `COT-${String(quotation.consecutive).padStart(4, '0')}`;
      await tx.notification.createMany({
        data: recipients.map((recipient) => ({
          userId: recipient.id,
          message: `${quotation.client_name || 'Un cliente'} aprobo la cotizacion ${formattedConsecutive}.`,
          type: 'QUOTATION_ACCEPTED',
          relatedId: quotation.id,
          resourceId: quotation.id,
          url: '/cotizaciones'
        }))
      });
    }

    return { quotation: approvedQuotation, alreadyAccepted: false };
  })
);
