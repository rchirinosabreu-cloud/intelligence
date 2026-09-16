import test from 'node:test';
import assert from 'node:assert/strict';
import {securityHeaders} from '../src/config/security.js';

test('chat can request its own microphone and play local drafts without opening unrelated permissions',()=>{
  const headers={};securityHeaders({}, {setHeader:(name,value)=>headers[name]=value},()=>{});
  assert.equal(headers['Permissions-Policy'],'camera=(), microphone=(self), geolocation=()');
  const csp=headers['Content-Security-Policy'];
  assert.match(csp,/(?:^|; )media-src 'self' blob:(?:;|$)/);
  assert.match(csp,/object-src 'none'/);assert.match(csp,/frame-ancestors 'none'/);
  assert.doesNotMatch(csp,/media-src[^;]*(?:https:|\*)/,'Media remains restricted to this app and local blobs');
});
