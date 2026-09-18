import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';

for (const file of [
  'src/components/layout/ChaosMeter.jsx',
  'src/components/layout/SidebarProfile.jsx',
  'src/components/layout/Sidebar.jsx',
  'src/components/modules/QualityStreakWidget.jsx',
  'src/components/modules/Dashboard.jsx',
  'src/components/modules/DashboardAnnouncements.jsx',
  'src/components/modules/dashboard/DashboardUpcomingTasks.jsx',
  'src/components/modules/dashboard/DashboardMeetings.jsx',
  'src/components/modules/dashboard/DashboardCrmAttention.jsx',
  'src/components/modules/dashboard/DashboardTip.jsx',
  'src/components/profile/AvatarEditor.jsx',
  'src/components/ui/TeamAvatar.jsx',
  'src/components/ui/SlideOver.jsx'
]) {
  test(`${file} compiles as JSX`, async () => {
    const source = await readFile(file, 'utf8');
    await transformWithEsbuild(source, file, { loader: 'jsx', jsx: 'automatic' });
  });
}
