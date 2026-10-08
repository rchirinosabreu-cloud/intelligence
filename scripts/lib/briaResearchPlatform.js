// The authorized, loopback-only research owner can read current content plans.
// This is not a production User/session. Only the listed read tools are attached;
// tasks, financials and private task bodies are deliberately outside this adapter.
export const createResearchPlatformReadAdapter = ({ pool }) => ({
  client: { async findMany({ where }) {
    return (await pool.query(`SELECT c.id,c.name,c.slug,c.status,c."isArchived",json_build_object('name',r.name) AS responsible,json_build_object('name',p.name) AS "projectManager" FROM "Client" c LEFT JOIN "TeamMember" r ON r.id=c."responsibleId" LEFT JOIN "TeamMember" p ON p.id=c."projectManagerId" WHERE c.name ILIKE '%'||$1||'%' ORDER BY c."isArchived",c.name LIMIT 8`, [where.name.contains])).rows;
  } },
  contentPlan: { async findFirst({ where }) {
    const plan = (await pool.query(`SELECT p.id,p.month,p.year,p.status,json_build_object('name',c.name,'slug',c.slug) AS client FROM "ContentPlan" p JOIN "Client" c ON c.id=p."clientId" WHERE p."clientId"=$1 AND p.month=$2 AND p.year=$3 AND p."deletedAt" IS NULL ORDER BY p."updatedAt" DESC LIMIT 1`, [where.clientId, where.month, where.year])).rows[0];
    if (!plan) return null;
    plan.contentItems = (await pool.query(`SELECT i.id,i.objective,i.format,i."publishDate",i."publishTime",i.status,i."copyText",i."captionText",i."finalAssetKey",i."revisionRequestedAt",json_build_object('finalAssets',(SELECT count(*) FROM "ContentItemFinalAsset" a WHERE a."contentItemId"=i.id)) AS _count,COALESCE((SELECT json_agg(json_build_object('status',s.status)) FROM "SocialPublication" s WHERE s."contentItemId"=i.id),'[]') AS publications FROM "ContentItem" i WHERE i."planId"=$1 AND i."deletedAt" IS NULL ORDER BY i."publishDate",i.id`, [plan.id])).rows;
    return plan;
  } },
  contentItem: { async findMany({ where, skip, take }) {
    return (await pool.query(`SELECT i.id,i.objective,i.format,i."publishDate",i.status,i."copyText",i."captionText",i."internalNotes",json_build_object('id',p.id,'strategicObjectives',p."strategicObjectives",'client',json_build_object('name',c.name)) AS plan FROM "ContentItem" i JOIN "ContentPlan" p ON p.id=i."planId" JOIN "Client" c ON c.id=p."clientId" WHERE i."planId"=$1 AND i."deletedAt" IS NULL AND p."deletedAt" IS NULL ORDER BY i."publishDate",i.id OFFSET $2 LIMIT $3`, [where.planId, skip, take])).rows;
  } }
});
