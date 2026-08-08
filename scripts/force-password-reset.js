import prisma from '../src/lib/prisma.js';

const main = async () => {
  const result = await prisma.user.updateMany({
    where: { isActive: true },
    data: {
      mustChangePassword: true,
      sessionVersion: { increment: 1 }
    }
  });

  console.log(`Password reset required for ${result.count} active users.`);
};

main()
  .catch((error) => {
    console.error('Failed to force password reset:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
