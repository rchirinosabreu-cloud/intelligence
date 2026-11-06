import test from 'node:test';
import assert from 'node:assert/strict';
import { publicationDate } from '../src/services/contentPeriodTransferService.js';
import { createSocialPublishingService } from '../src/services/socialPublishingService.js';

test('el período usa el día de publicación, incluso en enero y el primer día del mes', () => {
  assert.equal(publicationDate('2031-01-01').getUTCMonth(), 0);
  assert.equal(publicationDate('2032-02-29').toISOString(), '2032-02-29T00:00:00.000Z');
  for (const value of ['2031-02-29', '2032-02-30', null, '', 0, 'no-fecha']) {
    assert.throws(() => publicationDate(value), error => error.status === 400);
  }
});

test('un trabajador con la fecha antigua no puede reclamar una publicación reprogramada', async () => {
  const oldDate = new Date('2030-10-01T15:00:00Z');
  let claimed;
  const service = createSocialPublishingService({ db: { socialPublication: {
    updateMany: async ({ where }) => { claimed = where; return { count: where.scheduledAt === oldDate ? 0 : 1 }; }
  } } });
  assert.equal((await service.publishOne({ id: 'publication', status: 'SCHEDULED', leaseToken: null, scheduledAt: oldDate })).status, 'SKIPPED');
  assert.equal(claimed.scheduledAt, oldDate);
});
