// Las fuentes de cada área para los hábitos de la liga (Rodny, 12 de noviembre de 2026: «Sí, hábitos por área»). Solo
// lee: junta lo que cada persona lleva en Parrillas, el CRM, Pautas y Financiero, y la regla de `leagueAreaChecks.js`
// lo convierte en chequeos.
//
// Dos clases de lectura. Lo que es una foto del momento —piezas atrasadas, seguimientos vencidos, pautas sin gasto
// final, piezas de hoy— solo se lee para el día en curso: con lo de hoy no se juzga un día pasado. Lo que tiene su
// propia fecha de registro —gestiones del CRM, movimientos, cuentas por pagar— vale para cualquier día.
//
// Una fuente que falla se deja fuera y se anota; nunca tumba el día. Una base sin esos modelos (los dobles de las
// pruebas) no lee nada, y las parrillas solo se leen si quien crea el servicio pasa con qué: nunca se cae por defecto a la
// base real.
import { CRM_ACTIVITY_TYPES } from '../lib/crmRules.js';
import { adBudgetsCheck, crmFollowUpCheck, crmNotesCheck, financialSupportCheck, piecesOnTimeCheck, plansOverdueCheck } from '../lib/leagueAreaChecks.js';

const CONTACT_TYPES = CRM_ACTIVITY_TYPES.filter((type) => type.contact).map((type) => type.value);
/** La foto de hoy se reutiliza unos minutos: abrir la copa varias veces no vuelve a leer todas las cuentas. */
export const AREA_SNAPSHOT_TTL_MS = 5 * 60 * 1000;
const can = (model) => typeof model?.findMany === 'function';
const emptyChecks = () => ({ AL_DIA: [], A_TIEMPO: [], DOCUMENTADO: [] });

export const createLeagueAreaSources = ({ db = {}, listOverduePlans = null, describeBudget = null, adBudgetInclude = undefined, now = () => new Date(), logger = console } = {}) => {
  let cache = null;
  const attempt = async (label, read, fallback) => {
    try { return await read(); }
    catch (error) { logger.error(`[Liga] Sin lectura de ${label}:`, error?.message || error); return fallback; }
  };

  /** Lo que tiene fecha propia: gestiones del CRM y registros de Financiero creados en la ventana del día. */
  const readDocumentation = async ({ start, end, userIds }) => {
    const created = { gte: start, lt: end };
    const [activities, records, payables] = await Promise.all([
      // La gestión de un toque desde la banda (`aviso-…`) no juega: su nota la escribe la plataforma, no la persona.
      can(db.crmActivity) ? attempt('las gestiones del CRM', async () => (await db.crmActivity.findMany({ where: { createdAt: created, authorId: { in: userIds }, type: { in: CONTACT_TYPES } }, select: { authorId: true, note: true, result: true, requestId: true } }))
        .filter((row) => !String(row.requestId || '').startsWith('aviso-')), []) : [],
      can(db.financialRecord) ? attempt('los movimientos de Financiero', () => db.financialRecord.findMany({ where: { createdAt: created, createdById: { in: userIds }, origin: { not: 'IMPORT' }, voidedAt: null },
        select: { createdById: true, notes: true, reference: true, attachmentUrl: true, documents: { where: { voidedAt: null, uploadedAt: { lt: end } }, select: { id: true }, take: 1 } } }), []) : [],
      can(db.accountsPayable) ? attempt('las cuentas por pagar', () => db.accountsPayable.findMany({ where: { createdAt: created, createdById: { in: userIds }, voidedAt: null },
        select: { createdById: true, notes: true, documentNumber: true, documents: { where: { voidedAt: null, uploadedAt: { lt: end } }, select: { id: true }, take: 1 } } }), []) : []
    ]);
    return { activities, records, payables };
  };

  /** La foto del momento: cuentas con piezas atrasadas, piezas de hoy, oportunidades y pautas que la persona lleva. */
  const readToday = async ({ dayKey, memberIds }) => {
    const accounts = listOverduePlans ? await attempt('las parrillas', () => listOverduePlans({ includeClean: true }), []) : [];
    const clientIds = [...new Set(accounts.map((account) => account.clientId))];
    const dayStart = new Date(`${dayKey}T00:00:00.000Z`), dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const [pieces, leads, budgets] = await Promise.all([
      clientIds.length && can(db.contentItem) ? attempt('las piezas de hoy', () => db.contentItem.findMany({
        where: { deletedAt: null, publishDate: { gte: dayStart, lt: dayEnd }, plan: { deletedAt: null, clientId: { in: clientIds } } },
        select: { status: true, plan: { select: { clientId: true } } } }), []) : [],
      can(db.crmLead) ? attempt('los seguimientos del CRM', () => db.crmLead.findMany({ where: { ownerId: { in: memberIds }, archivedAt: null }, select: { ownerId: true, stage: true, nextFollowUpAt: true, archivedAt: true } }), []) : [],
      can(db.adBudget) && describeBudget ? attempt('las pautas', async () => (await db.adBudget.findMany({ where: { status: 'ACTIVA', responsibleId: { in: memberIds } }, ...(adBudgetInclude ? { include: adBudgetInclude } : {}) }))
        .filter((row) => !row.client?.isArchived).map((row) => ({ responsibleId: row.responsibleId, ...describeBudget(row, dayKey) })), []) : []
    ]);
    return { accounts, pieces, leads, budgets };
  };

  return {
    /** Por persona, los chequeos de su área para cada hábito: `{ AL_DIA, A_TIEMPO, DOCUMENTADO }`. */
    async read({ dayKey, isToday, start, end, members = [] }) {
      const userIds = members.map((member) => member.user?.id).filter(Boolean);
      const memberIds = members.map((member) => member.id);
      const documentation = await readDocumentation({ start, end, userIds });
      let today = null;
      if (isToday) {
        const at = now().getTime();
        if (cache && cache.dayKey === dayKey && at - cache.at < AREA_SNAPSHOT_TTL_MS) today = cache.value;
        else { today = await readToday({ dayKey, memberIds }); cache = { dayKey, at, value: today }; }
      }

      const out = new Map(members.map((member) => [member.id, emptyChecks()]));
      for (const member of members) {
        const userId = member.user?.id;
        const checks = out.get(member.id);
        checks.DOCUMENTADO.push(
          crmNotesCheck(documentation.activities.filter((row) => row.authorId === userId)),
          financialSupportCheck(
            documentation.records.filter((row) => row.createdById === userId).map((row) => ({ ...row, hasDocument: Boolean(row.attachmentUrl) || (row.documents || []).length > 0 })),
            documentation.payables.filter((row) => row.createdById === userId).map((row) => ({ ...row, hasDocument: (row.documents || []).length > 0 }))
          )
        );
        if (today) {
          // Una cuenta cuenta una vez por persona aunque la lleve como community y como project manager.
          const carried = today.accounts.filter((account) => [account.communityManager?.userId, account.projectManager?.userId].includes(userId));
          const carriedIds = new Set(carried.map((account) => account.clientId));
          checks.AL_DIA.push(
            plansOverdueCheck(carried),
            crmFollowUpCheck(today.leads.filter((lead) => lead.ownerId === member.id), now()),
            adBudgetsCheck(today.budgets.filter((budget) => budget.responsibleId === member.id))
          );
          checks.A_TIEMPO.push(piecesOnTimeCheck(today.pieces.filter((piece) => carriedIds.has(piece.plan?.clientId))));
        }
        for (const key of Object.keys(checks)) checks[key] = checks[key].filter(Boolean);
      }
      return out;
    }
  };
};
