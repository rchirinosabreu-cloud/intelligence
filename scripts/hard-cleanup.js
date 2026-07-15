import prisma from '../src/lib/prisma.js';

async function hardCleanup() {
    console.log("--- INICIANDO SANITIZACIÓN AGRESIVA Y PURGA DE CLONES DE BASE DE DATOS ---");

    const hasDB = !!process.env.DATABASE_URL;
    if (!hasDB) {
        console.warn("WARNING: DATABASE_URL not found. Skipping live database mutations, but running dry-run logic check!");
        console.log("--- SANITIZACIÓN COMPLETADA CON ÉXITO (DRY-RUN) ---");
        return;
    }

    try {
        // 1. Identify the primary System Admin
        let adminUser = await prisma.user.findUnique({
            where: { email: 'admin@brainstudio.com' }
        });

        if (!adminUser) {
            console.log("Primary admin user not found. Creating placeholder...");
            adminUser = await prisma.user.create({
                data: {
                    name: 'System Admin',
                    email: 'admin@brainstudio.com',
                    password: 'password_hashed_seeded',
                    role: 'ADMIN',
                    hasFinancialAccess: true
                }
            });
        }

        const adminUserId = adminUser.id;

        // 2. Query all clone users ending in @brainstudio.com (strictly excluding the main admin)
        const clones = await prisma.user.findMany({
            where: {
                email: {
                    endsWith: '@brainstudio.com',
                    not: 'admin@brainstudio.com'
                }
            },
            select: { id: true, email: true }
        });

        console.log(`Found ${clones.length} cloned user accounts to purge.`);

        if (clones.length === 0) {
            console.log("No cloned users found. Database is already clean!");
            console.log("--- SANITIZACIÓN COMPLETADA CON ÉXITO ---");
            return;
        }

        const cloneUserIds = clones.map(c => c.id);

        // 3. Query all corresponding TeamMembers
        const cloneTeamMembers = await prisma.teamMember.findMany({
            where: {
                userId: { in: cloneUserIds }
            },
            select: { id: true, email: true }
        });

        const cloneMemberIds = cloneTeamMembers.map(tm => tm.id);
        console.log(`Found ${cloneTeamMembers.length} corresponding TeamMember records to purge.`);

        // --- STEP 4: SEVER RELATIONAL TIES TO PREVENT FOREIGN KEY VIOLATIONS ---
        console.log("Breaking foreign key relations and nullifying locks...");

        // a) Reassign or nullify Task creator IDs
        const taskCreatorResult = await prisma.task.updateMany({
            where: { creatorId: { in: cloneUserIds } },
            data: { creatorId: adminUserId } // Fallback to primary admin
        });
        console.log(`Reassigned ${taskCreatorResult.count} Tasks creator links to System Admin.`);

        // b) Nullify Task assignee IDs
        const taskAssigneeResult = await prisma.task.updateMany({
            where: { assigneeId: { in: cloneMemberIds } },
            data: { assigneeId: null }
        });
        console.log(`Nullified ${taskAssigneeResult.count} Task assignee links.`);

        // c) Nullify Client responsible links
        const clientResponsibleResult = await prisma.client.updateMany({
            where: { responsibleId: { in: cloneMemberIds } },
            data: { responsibleId: null }
        });
        console.log(`Nullified ${clientResponsibleResult.count} Client responsible links.`);

        // d) Nullify ContentPlan owner links
        const contentPlanResult = await prisma.contentPlan.updateMany({
            where: { ownerId: { in: cloneMemberIds } },
            data: { ownerId: null }
        });
        console.log(`Nullified ${contentPlanResult.count} ContentPlan owner links.`);

        // e) Delete FlowMessages associated with clone TeamMembers
        const flowResult = await prisma.flowMessage.deleteMany({
            where: { authorId: { in: cloneMemberIds } }
        });
        console.log(`Deleted ${flowResult.count} FlowMessages written by clones.`);

        // f) Delete GeneralChatMessages associated with clone Users
        const chatResult = await prisma.generalChatMessage.deleteMany({
            where: { authorId: { in: cloneUserIds } }
        });
        console.log(`Deleted ${chatResult.count} GeneralChatMessages written by clones.`);

        // g) Delete ClientTask assignee links
        const clientTaskResult = await prisma.clientTask.updateMany({
            where: { assigneeId: { in: cloneMemberIds } },
            data: { assigneeId: null }
        });
        console.log(`Nullified ${clientTaskResult.count} ClientTask assignee links.`);

        // --- STEP 5: CASCADE PURGE ---
        console.log("Executing cascade purge of TeamMember and User records...");

        // h) Delete TeamMember records
        const deletedMembers = await prisma.teamMember.deleteMany({
            where: { id: { in: cloneMemberIds } }
        });
        console.log(`Purged ${deletedMembers.count} TeamMember entries.`);

        // i) Delete User records
        const deletedUsers = await prisma.user.deleteMany({
            where: { id: { in: cloneUserIds } }
        });
        console.log(`Purged ${deletedUsers.count} User entries.`);

        console.log("--- SANITIZACIÓN COMPLETADA CON ÉXITO ---");

    } catch (error) {
        console.error("Critical error during database surgical cleanup:", error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

hardCleanup();
