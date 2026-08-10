import test from 'node:test';
import assert from 'node:assert/strict';
import dashboardRouter from '../src/routes/api/dashboard.js';

test('dashboard announcement routes expose create, update and delete operations', () => {
  const routes = dashboardRouter.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).filter((method) => layer.route.methods[method])
    }));

  assert.ok(routes.some((route) => route.path === '/announcements' && route.methods.includes('post')));
  assert.ok(routes.some((route) => route.path === '/announcements/:scope/:id' && route.methods.includes('patch')));
  assert.ok(routes.some((route) => route.path === '/announcements/:scope/:id' && route.methods.includes('delete')));
});
