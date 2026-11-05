import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = file => readFileSync(new URL(`../src/components/modules/${file}`, import.meta.url), 'utf8');

test('los enlaces internos entre Terceros, CRM y cotizaciones llevan origen sin recargar la aplicación', () => {
  for (const file of ['financial/FinancialPartiesDirectory.jsx', 'Crm/CrmLeadDetail.jsx', 'Quotations/QuotationForm.jsx']) {
    const source = read(file);
    assert.match(source, /useOriginState\(/, file);
    assert.doesNotMatch(source, /<a href=\{`\/(crm|cotizaciones)/, file);
    assert.match(source, /state=\{originState\(\)\}/, file);
  }
  const detail = read('Crm/CrmLeadDetail.jsx');
  assert.match(detail, /navigateFrom\(`\/cotizaciones\/editar\/\$\{result\.quotation\.id\}`\)/);
});

test('las pestañas del CRM conservan el origen y sus aperturas ofrecen regresar', () => {
  const source = read('Crm/CrmLayout.jsx');
  assert.match(source, /setSearchParams\(next, \{ replace: true, state: location\.state \}\)/);
  assert.match(source, /navigateFrom\(`\/crm\/oportunidades\/\$\{id\}`\)/);
});

test('guardar una cotización nueva conserva el origen y no convierte su URL anterior en destino de regreso', () => {
  assert.match(read('Quotations/QuotationForm.jsx'), /navigate\(`\/cotizaciones\/editar\/\$\{data\.id\}`, \{ replace: true, state: location\.state \}\)/);
});

test('la flecha del editor de cotización vuelve al origen e identifica su destino', () => {
  const source = read('Quotations/QuotationForm.jsx');
  assert.ok(/useBackToOrigin\('\/cotizaciones'\)/.test(source), 'la flecha comparte el retorno y usa la lista solo como alternativa');
  assert.ok(/onClick=\{goBack\}/.test(source));
  assert.ok(/aria-label=\{backLabel\}/.test(source), 'la flecha anuncia a dónde regresa');
  assert.ok(/origin\?\.label \|\| 'Cotizaciones'/.test(source));
});
