// Drive the visible desktop menu, not a synthetic change on the hidden form field.
export const nativeSelect = control => control.locator('xpath=following-sibling::select[@data-brain-select-native]');

export async function chooseOption(control, value) {
  if (await control.evaluate(element => element.tagName) === 'SELECT') return control.selectOption(value);
  const label = await nativeSelect(control).locator(`option[value=${JSON.stringify(value)}]`).textContent();
  await control.click();
  await control.page().getByRole('option', { name: label, exact: true }).click();
}
