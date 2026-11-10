import test from 'node:test';
import assert from 'node:assert/strict';
import { groupFinancialReceivables } from '../src/utils/financialReceivables.js';
import { buildPartyRows } from '../src/lib/clientDirectoryRows.js';
import { groupPayrollPeople } from '../src/lib/payrollPeople.js';

test('Francisco tiene una ficha con préstamos, canjes y sus aplicaciones intactas', () => {
  const items = [
    { id:'loan', kind:'PRESTAMO', partyId:'francisco', partyName:'Francisco Villa', clientName:'Francisco', outstanding:163146, payments:[{id:'payment',amount:55000}] },
    { id:'barter', kind:'BENEFICIARIO', partyId:'francisco', partyName:'Francisco Villa', beneficiaryThirdPartyId:'francisco', clientName:'Francisco Villa', outstanding:1260000 },
    { id:'other', kind:'PRESTAMO', partyId:'homonym', clientName:'Francisco Villa', outstanding:10 },
  ];
  const groups = groupFinancialReceivables(items);
  assert.equal(groups.length,2);
  assert.equal(groups[0].totalOutstanding,1423146);
  assert.equal(groups[0].client.name,'Francisco Villa');
  assert.deepEqual(groups[0].debts,items.slice(0,2));
  assert.deepEqual(groups[0].kinds,['PRESTAMO','BENEFICIARIO']);
});

test('Jesu aparece una vez con ambos períodos; Francys reúne ambos contratos por identidad, no por nombre',()=>{
  const rows=[{id:'j',collaboratorId:'jesu',name:'Jesús Arnedo',transaction:{id:'oct',netAmount:750000}}, {id:'j',collaboratorId:'jesu',name:'Jesús Arnedo',transaction:{id:'nov',netAmount:1500000}}, {id:'old',collaboratorId:'f1',partyId:'francys',name:'Francys Caballero'}, {id:'new',collaboratorId:'f2',partyId:'francys',name:'Francys Caballero'}];
  const groups=groupPayrollPeople(rows);
  assert.equal(groups.length,2);
  assert.equal(groups[0].contracts.length,2);
  assert.equal(groups[1].rows.length,2);
  assert.equal(groups[1].contracts.length,1);
});

test('Terceros integra las identidades de nómina vinculadas sin duplicar Francys', () => {
  const parties=[{id:'francys',name:'Francys Caballero',kind:'COLABORADOR',roles:['COLABORADOR'],collaborators:[{id:'old',displayName:'Francys Caballero'},{id:'new',displayName:'Francys'}]}];
  const rows=buildPartyRows([],parties,{},[],[{id:'old',displayName:'Francys Caballero',thirdPartyId:'francys'},{id:'new',displayName:'Francys',thirdPartyId:'francys'},{id:'jesu',displayName:'Jesús Arnedo'}]);
  assert.equal(rows.length,2);
  assert.equal(rows[0].name,'Francys Caballero');
  assert.equal(rows[1].name,'Jesús Arnedo');
});

test('un cliente explícitamente vinculado conserva servicios y préstamos dentro de la misma ficha aunque aún no tenga perfil de pago',()=>{
 const items=[{id:'service',clientId:'client',kind:'CLIENTE',outstanding:100},{id:'loan',clientId:'client',kind:'PRESTAMO',outstanding:200}];
 const result=groupFinancialReceivables(items);assert.equal(result.length,1);assert.equal(result[0].totalOutstanding,300);assert.deepEqual(result[0].debts,items);
});
