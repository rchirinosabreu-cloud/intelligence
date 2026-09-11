import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
test('all product select fields go through the shared mobile-aware component', () => {
  const offenders = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.[cm]?[jt]sx?$/.test(file) && path.resolve(file) !== path.resolve('src/components/ui/Select.jsx')) {
        const source = readFileSync(file, 'utf8');
        if (/<select\b|@radix-ui\/react-select/.test(source)) offenders.push(file);
      }
    }
  }
  walk('src');
  assert.deepEqual(offenders, []);
});

test('specialized option lists and action menus keep the shared neutral surface', () => {
  for (const file of ['modules/ChatWidget.jsx', 'modules/AnnouncementWidget.jsx', 'modules/DashboardAnnouncements.jsx', 'modules/Quotations/QuotationForm.jsx', 'modules/TaskSidePanel.jsx']) {
    assert.ok(/brain-popover-surface/.test(readFileSync(`src/components/${file}`, 'utf8')), file);
  }
  for (const file of ['ui/LinkDropdown.jsx', 'modules/Moodboard/MoodboardCanvas.jsx']) {
    assert.ok(/<DropdownMenuContent/.test(readFileSync(`src/components/${file}`, 'utf8')), file);
  }
});
