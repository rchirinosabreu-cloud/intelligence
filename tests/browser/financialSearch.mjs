import assert from 'node:assert/strict';

// Invoke with an isolated browser page and the financial-search.html fixture.
export async function verifyFinancialSearch(page) {
    const search = page.getByRole('searchbox', { name: 'Buscar en financiero' });
    assert.equal(await search.count(), 1, 'one universal search field');
    assert.equal(await page.getByRole('combobox', { name: 'Escenario financiero', exact: true }).count(), 1);
    assert.equal(await page.getByRole('combobox', { name: 'Mes', exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Movimientos', exact: true }).click();
    await search.fill('rodny');
    await page.getByText('Servicio Rodny 1', { exact: true }).waitFor({ state: 'visible' });
    assert.equal(await page.getByText('Suscripción Brain Studio', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await page.getByText('Honorarios Rodny', { exact: true }).waitFor({ state: 'visible' });
    await search.fill('brain');
    await page.getByText('Suscripción Brain Studio', { exact: true }).waitFor({ state: 'visible' });
    assert.equal(await page.getByText('Honorarios Rodny', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Anterior', exact: true }).isEnabled(), false);
    await search.fill('no existe');
    await page.getByText('No hay movimientos con estos filtros.', { exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Limpiar búsqueda', exact: true }).click();
    await page.getByText('Servicio Rodny 1', { exact: true }).waitFor({ state: 'visible' });
}
