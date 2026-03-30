
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

// Encryption helper duplicated to avoid dependency issues during seed
const IV_LENGTH = 16;
function encrypt(text) {
    const key = '12345678901234567890123456789012'; // 32 chars
    const keyBuffer = Buffer.from(key);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

async function main() {
  console.log('--- SEEDING PHASE 2 MOCK DATA (SQLITE) ---');

  // 1. Create User
  const email = 'admin@brainstudio.com';
  const hashedPassword = await bcrypt.hash('password123', 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: {
        password: hashedPassword
    },
    create: {
      name: 'System Admin',
      email: email,
      password: hashedPassword,
      role: 'ADMIN'
    }
  });
  console.log(`User: ${user.name}`);

  // 2. Create/Update Client: Bonsai CTG
  const client = await prisma.client.upsert({
    where: { slug: 'bonsai-ctg' },
    update: {
      facebookPageId: 'fb_bonsai',
      instagramBusinessId: 'ig_bonsai',
      adAccountId: 'act_bonsai'
    },
    create: {
      name: 'Bonsai CTG',
      slug: 'bonsai-ctg',
      facebookPageId: 'fb_bonsai',
      instagramBusinessId: 'ig_bonsai',
      adAccountId: 'act_bonsai'
    }
  });
  console.log(`Client: ${client.name} (${client.id})`);

  // 3. Create Integration record for Meta
  const mockToken = encrypt('mock_meta_token');
  await prisma.integration.upsert({
    where: { clientId_provider: { clientId: client.id, provider: 'meta' } },
    update: {
      encryptedToken: mockToken,
      metadata: JSON.stringify({ businessName: 'Bonsai Business Group', connectedAt: new Date().toISOString() })
    },
    create: {
      clientId: client.id,
      provider: 'meta',
      encryptedToken: mockToken,
      metadata: JSON.stringify({ businessName: 'Bonsai Business Group', connectedAt: new Date().toISOString() })
    }
  });
  console.log('Integration: Meta (Mocked)');

  console.log('--- SEED COMPLETE ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
