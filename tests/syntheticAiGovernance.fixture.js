import { after, mock } from 'node:test';
import { getGovernanceService } from '../src/services/aiGovernanceService.js';

// Only unit tests with a fixture transport import this explicit authorization double.
const stub = mock.method(getGovernanceService(), 'assertEgress', async () => ({ allowed: true, enforced: false }));
after(() => stub.mock.restore());
