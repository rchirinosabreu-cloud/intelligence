import { existsSync, readFileSync } from 'node:fs';

const expectedWrappers = new Map([
  ['src/components/modules/Activity/ActivityMap.jsx', "export { default } from './ActivityMapView';"],
  ['src/components/modules/Activity/OperationalCalendar.jsx', "export { default } from './OperationalCalendarView';"]
]);

const forbiddenLegacyCards = [
  'src/components/modules/Activity/MemberActivityCard.jsx',
  'src/components/modules/Activity/EventActivityCard.jsx'
];

for (const [file, expected] of expectedWrappers) {
  const source = readFileSync(file, 'utf8').trim();
  if (source !== expected) {
    throw new Error(`[DeploySourceGuard] ${file} is not the wrapper-v1 source. Do not Redeploy an old Railway deployment; use Deploy Latest Commit.`);
  }
}

for (const file of forbiddenLegacyCards) {
  if (existsSync(file)) {
    throw new Error(`[DeploySourceGuard] Legacy conflicting file detected: ${file}. Deploy the latest clean commit.`);
  }
}

console.log('[DeploySourceGuard] ACTIVITY_SOURCE_GENERATION=wrapper-v1');
console.log('[DeploySourceGuard] Activity entrypoints and card paths are clean.');
