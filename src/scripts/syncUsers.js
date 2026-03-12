import prisma from '../lib/prisma.js';

async function syncUsers() {
    console.log("Starting User ID synchronization for TeamMembers...");

    try {
        const teamMembers = await prisma.teamMember.findMany({
            where: {
                userId: null,
                email: { not: null, not: '' }
            }
        });

        console.log(`Found ${teamMembers.length} members without userId.`);

        let updatedCount = 0;
        for (const member of teamMembers) {
            const user = await prisma.user.findUnique({
                where: { email: member.email.trim().toLowerCase() }
            });

            if (user) {
                await prisma.teamMember.update({
                    where: { id: member.id },
                    data: { userId: user.id }
                });
                console.log(`Linked member ${member.name} to user ID ${user.id}`);
                updatedCount++;
            } else {
                console.log(`No user found for email ${member.email}`);
            }
        }

        console.log(`Synchronization finished. ${updatedCount} records updated.`);
    } catch (error) {
        console.error("Error during synchronization:", error);
    } finally {
        await prisma.$disconnect();
    }
}

syncUsers();
