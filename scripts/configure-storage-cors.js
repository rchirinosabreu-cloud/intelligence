import 'dotenv/config';
import { configureBucketCors } from '../src/services/storageService.js';
import { configureS3Cors } from '../src/services/s3Service.js';

const results = await Promise.allSettled([
  configureBucketCors(),
  configureS3Cors()
]);

const failures = results.filter((result) => result.status === 'rejected');
if (failures.length > 0) {
  failures.forEach((failure) => console.error('[Storage CORS] Configuration failed:', failure.reason));
  process.exitCode = 1;
} else {
  console.log('[Storage CORS] Configuration completed.');
}
