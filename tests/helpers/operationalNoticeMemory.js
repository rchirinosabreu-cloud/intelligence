// Base de prueba en memoria: nunca carga .env ni se conecta a PostgreSQL.
export function operationalNoticeMemory() {
    const actor = { id: 'pm-local', userId: 'pm-local', name: 'Kamila · muestra local', role: 'PROJECT_MANAGER', isActive: true,
        modulePermissions: { clientes: true, parrillas: true, financiero: false }, teamMember: { isActive: true, areas: ['ADMINISTRATIVA','PROJECT_MANAGEMENT','DIRECCION'] } };
    const data = {
        user:[actor], teamMember:[{userId:actor.id,...actor.teamMember}], notification:[],
        importantNotice:[], client:[], clientContract:[], clientContractDecision:[], projectFormalization:[], collectionSetting:[], accountsReceivable:[], crmLead:[], crmActivity:[], collectionActivity:[],
    };
    const match = (row, where={}) => Object.entries(where).every(([key,value]) => {
        if (key==='OR') return value.some(w=>match(row,w));
        if (key==='AND') return value.every(w=>match(row,w));
        if (value && typeof value==='object' && !(value instanceof Date)) {
            if ('in' in value) return value.in.includes(row[key]);
            if ('notIn' in value) return !value.notIn.includes(row[key]);
            if ('not' in value) return value.not && typeof value.not==='object' ? !match(row,{[key]:value.not}) : row[key] !== value.not;
            if ('startsWith' in value) return String(row[key]||'').startsWith(value.startsWith);
            if ('is' in value) return match(row[key]||{},value.is);
            if ('gte' in value) return row[key]>=value.gte;
            if ('gt' in value) return row[key]>value.gt;
            if ('lte' in value) return row[key]<=value.lte;
            return match(row[key]||{},value);
        }
        return value===null ? row[key]==null : value instanceof Date ? new Date(row[key]).getTime()===value.getTime() : row[key]===value;
    });
    const db={}; let sequence=0;
    for (const model of Object.keys(data)) {
        const findMany = async ({where,orderBy}={}) => {
            const rows=data[model].filter(row=>match(model==='crmActivity'?{...row,lead:data.crmLead.find(lead=>lead.id===row.leadId)}:row,where));
            if(orderBy) for(const order of (Array.isArray(orderBy)?[...orderBy].reverse():[orderBy])) { const [field,direction]=Object.entries(order)[0];rows.sort((a,b)=>(a[field]>b[field]?1:a[field]<b[field]?-1:0)*(direction==='desc'?-1:1)); }
            return rows;
        };
        db[model]={findMany, findUnique:async args=>(await findMany(args))[0]||null, findFirst:async args=>(await findMany(args))[0]||null,
            create:async({data:record})=>{const row={id:`memory-${++sequence}`,resolvedAt:null,snoozedUntil:null,decidedAt:null,...record};if(data[model].some(r=>r.id===row.id))throw Object.assign(new Error('unique'),{code:'P2002'});data[model].push(row);return row;},
            update:async({where,data:changes})=>{const row=(await findMany({where}))[0];if(!row)throw new Error(`missing ${model}`);Object.assign(row,changes);return row;},
            updateMany:async({where,data:changes})=>{const rows=await findMany({where});rows.forEach(r=>Object.assign(r,changes,model==='clientContract'?{updatedAt:new Date()}:{}));return{count:rows.length};}
        };
        db[model].upsert=async({where,create,update})=>(await db[model].findUnique({where}))?db[model].update({where,data:update}):db[model].create({data:create});
    }
    const findLead=db.crmLead.findUnique;
    db.crmLead.findUnique=async args=>{
        const row=await findLead(args);if(!row)return null;
        const where=args.select?.activities?.where || {};
        return {...row,activities:data.crmActivity.filter(activity=>activity.leadId===row.id && match(activity,where))};
    };
    db.$transaction=async work=>work(db);
    return {db,data,actor};
}
