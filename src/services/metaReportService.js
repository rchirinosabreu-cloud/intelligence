/**
 * De dónde salen las cifras de Meta de un informe (Rodny, 2 de octubre de 2026).
 *
 * - **Instagram**: la cuenta que el cliente ya tiene conectada para publicar (`ClientSocialAccount`),
 *   leída con la llave de su propia página, que está guardada cifrada y nunca sale del servidor.
 * - **Pauta**: una cuenta publicitaria elegida una vez por cliente (`ClientAdAccount`), leída con la
 *   llave de la agencia. Una cuenta publicitaria no es un cliente —la de la agencia lleva campañas de
 *   varios—, así que cada vínculo guarda las palabras que distinguen sus campañas.
 *
 * Aquí no se decide qué entra al informe: se devuelven **fuentes** con la forma de siempre y la
 * respuesta de Meta tal cual, para guardarla como comprobante. Solo lee; no cambia nada en Meta ni
 * apaga cuentas (eso es de la publicación).
 */
import { randomUUID } from 'node:crypto';
import prisma from '../lib/prisma.js';
import { decrypt as decryptSecret } from '../utils/encryption.js';
import { META_GRAPH_VERSION } from './metaGraphService.js';
import { metaInsightsService } from './metaInsightsService.js';
import { buildInstagramSources, buildMetaAdsSource, humanizeMetaReadError } from '../lib/metaReportSources.js';

const httpError = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });
export const CAMPAIGN_FILTER_MAX = 80;
const longDay = (day) => {
  const [year, month, date] = String(day).split('-').map(Number);
  return `${date} de ${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][month - 1]} de ${year}`;
};

const publicAdAccount = (row) => row && ({ id: row.id, adAccountId: row.adAccountId, name: row.name, currency: row.currency || null, campaignFilter: row.campaignFilter || null });

export const createMetaReportService = ({
  db = prisma,
  insights = metaInsightsService,
  decrypt = decryptSecret,
  systemToken = () => process.env.META_SYSTEM_USER_TOKEN || '',
  now = () => new Date(),
  newId = randomUUID
} = {}) => {
  const isConfigured = () => Boolean(String(systemToken() || '').trim());
  const requireToken = () => {
    const token = String(systemToken() || '').trim();
    if (!token) throw httpError(503, 'La conexión con Meta no está configurada: falta META_SYSTEM_USER_TOKEN en el servidor.', { code: 'META_NOT_CONFIGURED' });
    return token;
  };

  /** Lo que este cliente puede traer de Meta. Sin llaves: solo nombres e identificadores. */
  const listClientSources = async (clientId) => {
    const [social, ads] = await Promise.all([
      db.clientSocialAccount.findMany({ where: { clientId, platform: 'INSTAGRAM', isActive: true }, orderBy: [{ connectedAt: 'asc' }] }),
      db.clientAdAccount.findMany({ where: { clientId, isActive: true }, orderBy: [{ createdAt: 'asc' }] })
    ]);
    return {
      configured: isConfigured(),
      instagram: social.map((row) => ({ id: row.id, displayName: row.displayName, pageId: row.pageId || null })),
      adAccounts: ads.map(publicAdAccount)
    };
  };

  const listAvailableAdAccounts = async () => insights.listAdAccounts(requireToken());

  const linkAdAccount = async ({ clientId, adAccountId, campaignFilter = '', actorUserId = null }) => {
    const token = requireToken();
    const filter = String(campaignFilter || '').trim();
    if (filter.length > CAMPAIGN_FILTER_MAX) throw httpError(422, `El texto que distingue las campañas no puede pasar de ${CAMPAIGN_FILTER_MAX} caracteres.`);
    const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) throw httpError(404, 'El cliente no existe.');
    const wanted = String(adAccountId || '').replace(/^act_/, '').trim();
    const account = (await insights.listAdAccounts(token)).find((candidate) => candidate.id === wanted);
    if (!account) throw httpError(404, 'La llave de Meta de la agencia no ve esa cuenta publicitaria. Dale acceso y vuelve a intentarlo.');
    const data = { name: account.name, currency: account.currency || null, campaignFilter: filter || null, isActive: true, connectedById: actorUserId };
    const current = await db.clientAdAccount.findFirst({ where: { clientId, adAccountId: account.id } });
    const row = current
      ? await db.clientAdAccount.update({ where: { id: current.id }, data })
      : await db.clientAdAccount.create({ data: { clientId, adAccountId: account.id, ...data } });
    return publicAdAccount(row);
  };

  /** Quitar el vínculo lo apaga; la fila queda como historial de qué cuenta se usó. */
  const unlinkAdAccount = async ({ id }) => {
    const row = await db.clientAdAccount.findUnique({ where: { id } });
    if (!row) throw httpError(404, 'La cuenta publicitaria vinculada no existe.');
    return publicAdAccount(await db.clientAdAccount.update({ where: { id }, data: { isActive: false } }));
  };

  const receipt = (kind, request, response) => ({ provider: 'META_GRAPH_API', version: META_GRAPH_VERSION, kind, fetchedAt: response?.fetchedAt || now().toISOString(), request, response });

  const fetchInstagram = async ({ clientId, period, instagramAccountId }) => {
    const row = await db.clientSocialAccount.findUnique({ where: { id: instagramAccountId } });
    if (!row || row.clientId !== clientId || row.platform !== 'INSTAGRAM') throw httpError(422, 'Esa cuenta de Instagram no es de este cliente.');
    const label = `Instagram ${row.displayName} · cifras de Meta`;
    if (row.isActive === false) return { kind: 'INSTAGRAM', label, error: `La cuenta ${row.displayName} está desconectada: vuelve a conectarla desde la ficha del cliente.` };
    try {
      const report = await insights.fetchInstagramReport({ igUserId: row.externalId, username: String(row.displayName || '').replace(/^@/, '') || null, token: decrypt(row.encryptedToken), period });
      const sources = buildInstagramSources({ ...report, sourceIds: { account: newId(), content: newId() } });
      return { kind: 'INSTAGRAM', label, sources, raw: receipt('INSTAGRAM', { igUserId: row.externalId, period }, report) };
    } catch (error) {
      console.error('[MetaReports] Instagram no entregó cifras:', error.code ?? '', error.message);
      return { kind: 'INSTAGRAM', label, error: humanizeMetaReadError(error) };
    }
  };

  const fetchAds = async ({ clientId, period, adAccountLinkId }) => {
    const row = await db.clientAdAccount.findUnique({ where: { id: adAccountLinkId } });
    if (!row || row.clientId !== clientId || row.isActive === false) throw httpError(422, 'Esa cuenta publicitaria no está vinculada a este cliente.');
    const only = row.campaignFilter ? ` · campañas «${row.campaignFilter}»` : '';
    const label = `Pauta «${row.name}»${only} · cifras de Meta`;
    try {
      const report = await insights.fetchAdsReport({ adAccountId: row.adAccountId, token: requireToken(), period, campaignFilter: row.campaignFilter || '' });
      const source = buildMetaAdsSource({ ...report, sourceId: newId() });
      if (!source) {
        const which = row.campaignFilter ? `no tuvo campañas con «${row.campaignFilter}» en el nombre que invirtieran` : 'no tuvo inversión';
        return { kind: 'ADS', label, note: `La cuenta publicitaria «${row.name}» ${which} entre el ${longDay(period.start)} y el ${longDay(period.end)}: el informe sale sin pauta de Meta.` };
      }
      return { kind: 'ADS', label, sources: [source], raw: receipt('ADS', { adAccountId: row.adAccountId, campaignFilter: row.campaignFilter || null, period }, report) };
    } catch (error) {
      if (error.code === 'META_NOT_CONFIGURED') throw error;
      console.error('[MetaReports] La cuenta publicitaria no entregó cifras:', error.code ?? '', error.message);
      return { kind: 'ADS', label, error: humanizeMetaReadError(error) };
    }
  };

  /**
   * Las cifras de un período, una entrada por cuenta pedida: `sources` (con `raw`, el comprobante),
   * `error` (Meta no las dio, con el motivo en español) o `note` (no hay nada que traer). Una cuenta
   * que falla no tumba a la otra. Pedir la cuenta de otro cliente sí es un error de la petición.
   */
  const fetchSources = async ({ clientId, period, instagramAccountId = null, adAccountLinkId = null }) => {
    const work = [];
    if (instagramAccountId) work.push(fetchInstagram({ clientId, period, instagramAccountId }));
    if (adAccountLinkId) work.push(fetchAds({ clientId, period, adAccountLinkId }));
    return Promise.all(work);
  };

  return { isConfigured, listClientSources, listAvailableAdAccounts, linkAdAccount, unlinkAdAccount, fetchSources };
};

export const metaReportService = createMetaReportService();
