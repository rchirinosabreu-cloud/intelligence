import pg from 'pg';
import { createBriaKnowledgeRepository } from './briaKnowledgeRepository.js';
import { resolveKnowledgeActor } from './briaKnowledgeApplication.js';
import { createBriaAgencyRepository } from './briaAgencyRepository.js';
let repository;
export const getBriaLivingRepository = async () => {
  if (repository) return repository;
  if (process.env.NODE_ENV === 'production' || !process.env.BRIA_RESEARCH_DIRECTORY) {
    repository = createBriaAgencyRepository({
      repository: createBriaKnowledgeRepository({ pool: new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, options: '-c default_transaction_read_only=on -c statement_timeout=10000' }), workspace: 'research:social.brainstudio@gmail.com' }),
      resolveActor: resolveKnowledgeActor,
      ownerIds: String(process.env.BRIA_RESEARCH_OWNER_IDS || '').split(',').map(id => id.trim()).filter(Boolean)
    });
    return repository;
  }
  const { createBriaResearchRepository } = await import('./briaResearchRepository.js');
  repository = createBriaResearchRepository({ directory: process.env.BRIA_RESEARCH_DIRECTORY });
  return repository;
};
export const searchAgencyMemory = async (user, query) => (await getBriaLivingRepository()).search(user, query);
export const readAgencyMemory = async (user, id, offset) => (await getBriaLivingRepository()).read(user, id, offset);
export const canReadAgencyMemory = async user => await (await getBriaLivingRepository()).canRead?.(user) === true;
