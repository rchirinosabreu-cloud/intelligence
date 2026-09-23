import prisma from '../lib/prisma.js';
import { receiveCommercialRequest, CommercialRequestError, buildConfirmationEmail, intakeRecipients } from '../services/commercialRequestService.js';
import { createNotification } from '../services/notificationService.js';
import { sendPlainEmail } from '../services/transactionalEmailService.js';

/**
 * POST /api/public/commercial-request — public, rate limited by the /api/public limiter.
 * Creates the CRM opportunity; the notification and the confirmation email never block the response.
 */
export const receive = async (req, res) => {
  try {
    const result = await receiveCommercialRequest(prisma, req.body || {});
    if (result.ignored) return res.status(201).json({ ok: true, reference: null });
    intakeRecipients(prisma, result.ownerUserId)
      .then(recipients => Promise.all(recipients.map(userId => createNotification({
        userId,
        type: 'CRM_REQUEST_RECEIVED',
        message: `Nueva solicitud comercial: ${result.company || result.contactName || 'sin nombre'} (${result.reference}).`,
        relatedId: result.leadId,
        url: `/crm/oportunidades/${result.leadId}`
      }))))
      .catch(error => console.error('[CommercialRequest] Notification failed:', error?.message || error));
    if (result.email) {
      const email = buildConfirmationEmail({ contactName: result.contactName, reference: result.reference });
      sendPlainEmail({ to: result.email, ...email }).catch(error => console.error('[CommercialRequest] Confirmation email failed:', error?.message || error));
    }
    return res.status(201).json({ ok: true, reference: result.reference });
  } catch (error) {
    if (error instanceof CommercialRequestError) return res.status(error.statusCode).json({ error: error.message, details: error.details });
    console.error('[CommercialRequest] Intake failed:', error);
    return res.status(500).json({ error: 'No pudimos registrar tu solicitud. Inténtalo de nuevo en un momento.' });
  }
};
