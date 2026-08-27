import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const quotationForm = fs.readFileSync('src/components/modules/Quotations/QuotationForm.jsx', 'utf8');
const catalogManagement = fs.readFileSync('src/components/modules/Quotations/CatalogManagement.jsx', 'utf8');
const serviceModal = fs.readFileSync('src/components/modules/Quotations/ServiceCatalogModal.jsx', 'utf8');

test('quotation search can create and immediately select a missing catalog service', () => {
  assert.match(quotationForm, /Crear .*como nuevo servicio/);
  assert.match(quotationForm, /initialName=\{searchTerm\}/);
  assert.match(quotationForm, /onSaved=\{addItem\}/);
  assert.match(serviceModal, /onSaved\?\.\(savedService\)/);
  assert.match(serviceModal, /invalidateQueries\(\{ queryKey: \['service-catalog'\] \}\)/);
});

test('catalog and quotation use the same service modal', () => {
  assert.match(catalogManagement, /<ServiceCatalogModal/);
  assert.match(quotationForm, /<ServiceCatalogModal/);
});
