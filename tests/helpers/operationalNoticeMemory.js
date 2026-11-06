// Base de prueba en memoria: nunca carga .env ni se conecta a PostgreSQL.
export function operationalNoticeMemory() {
    const actor = { id: 'pm-local', userId: 'pm-local', name: 'Kamila · muestra local', role: 'PROJECT_MANAGER', isActive: true,
        modulePermissions: { clientes: true, financiero: false }, teamMember: { isActive: true, areas: ['ADMINISTRATIVA','PROJECT_MANAGEMENT','DIRECCION'] } };
    const data = {
        user:[actor], teamMember:[{userId:actor.id,...actor.teamMember}], notification:[],
        importantNotice:[], client:[], projectFormalization:[], collectionSetting:[], accountsReceivable:[],
    };
    const match = (row, where={}) => Object.entries(where).every(([key,value]) => {
        if (key==='OR') return value.some(w=>match(row,w));
        if (key==='AND') return value.every(w=>match(row,w));
        if (value && typeof value==='object' && !(value instanceof Date)) {
            if ('in' in value) return value.in.includes(row[key]);
            if ('notIn' in value) return !value.notIn.includes(row[key]);
            if ('not' in value) return row[key] !== value.not;
            if ('startsWith' in value) return String(row[key]||'').startsWith(value.startsWith);
            if ('is' in value) return match(row[key]||{},value.is);
            if ('gte' in value) return row[key]>=value.gte;
            return match(row[key]||{},value);
        }
        return value===null ? row[key]==null : row[key]===value;
    });
    const db={}; let sequence=0;
    for (const model of Object.keys(data)) {
        const findMany = async ({where,orderBy}={}) => {
            const rows=data[model].filter(row=>match(row,where));
            if(orderBy) { const [field,direction]=Object.entries(orderBy)[0];rows.sort((a,b)=>(a[field]>b[field]?1:a[field]<b[field]?-1:0)*(direction==='desc'?-1:1)); }
            return rows;
        };
        db[model]={findMany, findUnique:async args=>(await findMany(args))[0]||null, findFirst:async args=>(await findMany(args))[0]||null,
            create:async({data:record})=>{const row={id:`memory-${++sequence}`,resolvedAt:null,snoozedUntil:null,decidedAt:null,...record};if(data[model].some(r=>r.id===row.id))throw Object.assign(new Error('unique'),{code:'P2002'});data[model].push(row);return row;},
            update:async({where,data:changes})=>{const row=(await findMany({where}))[0];if(!row)throw new Error(`missing ${model}`);Object.assign(row,changes);return row;},
            updateMany:async({where,data:changes})=>{const rows=await findMany({where});rows.forEach(r=>Object.assign(r,changes));return{count:rows.length};}
        };
    }
    db.$transaction=async work=>work(db);
    return {db,data,actor};
}
