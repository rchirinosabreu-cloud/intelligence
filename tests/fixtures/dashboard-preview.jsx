import React from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import App from '@/App';
import { ConfirmDialogProvider } from '@/components/ui/ConfirmDialog';
import { markTaskTimingTutorialSeen, markTaskTimingTutorialAfternoonSeen } from '@/lib/taskTiming';
import { dashboardDemoUser } from './dashboardPreviewData';
import '@/index.css';
import 'react-datepicker/dist/react-datepicker.css';

// This entry is served ONLY by scripts/preview-dashboard.js. Never loaded by src/main.jsx.
const previousToken = localStorage.getItem('authToken');
if (previousToken && !previousToken.endsWith('.dashboard-local')) {
  throw new Error('Este origen ya tiene una sesión. Usa un puerto distinto para no sustituirla.');
}
localStorage.setItem('authToken', `e30.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 86400 }))}.dashboard-local`);
// `?role=EDITOR` shows the platform as a non-manager (the mock API answers with the same role).
const previewRole = new URLSearchParams(location.search).get('role') === 'EDITOR' ? 'EDITOR' : dashboardDemoUser.role;
localStorage.setItem('currentUser', JSON.stringify({ ...dashboardDemoUser, role: previewRole }));
markTaskTimingTutorialSeen(localStorage, dashboardDemoUser.id);
markTaskTimingTutorialAfternoonSeen(localStorage, dashboardDemoUser.id);
if (new URLSearchParams(location.search).has('dark')) {
  document.documentElement.classList.add('dark');
  localStorage.setItem('theme', 'dark');
} else {
  localStorage.setItem('theme', 'light');
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <ConfirmDialogProvider>
        <App />
      </ConfirmDialogProvider>
    </MotionConfig>
  </React.StrictMode>
);
