import test from 'node:test';
import assert from 'node:assert/strict';
import * as service from '../src/services/importantNoticeService.js';

test('la proyección se limita a clientes asignados y no lleva dinero ni otra notificación', async () => {
    const queries = [];
    const db = {
        user: { findUnique: async () => ({ id: 'pm', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { clientes: true, financiero: false }, teamMember: { isActive: true } }) },
        client: { findMany: async args => { queries.push(args); return [{id:'c',name:'Faro',slug:'faro',projectManager:{userId:'pm',isActive:true},contracts:[{id:'k',status:'ACTIVO',startDate:'2026-10-01',endDate:'2026-11-20',cutDay:1}],monthlyReports:[],monthlyCloses:[],suspensions:[],accountsReceivables:[]}]; } },
        projectFormalization: {findMany:async()=>[]}, collectionSetting:{findUnique:async()=>null},
    };
    assert.equal(typeof service.readOperationalNotices,'function');
    const rows=await service.readOperationalNotices(db,'pm',new Date('2026-11-06T15:00:00Z'));
    assert.ok(queries[0].where.projectManager);
    assert.equal(rows.length,1);
    assert.match(rows[0].kind,/RENOVACION/);
    assert.doesNotMatch(JSON.stringify(rows),/amount|balance|payments|receivable|saldo/i);
});
test('sin permiso de Clientes no se lee ninguna cuenta', async()=>{
    const db={user:{findUnique:async()=>({role:'PROJECT_MANAGER',isActive:true,modulePermissions:{clientes:false},teamMember:{isActive:true}})},client:{findMany:async()=>{throw new Error('lectura no autorizada');}}};
    assert.equal(typeof service.readOperationalNotices,'function');
    assert.deepEqual(await service.readOperationalNotices(db,'pm',new Date()),[]);
});
