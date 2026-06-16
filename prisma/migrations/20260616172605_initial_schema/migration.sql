-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "BoardItemType" AS ENUM ('image', 'link', 'text');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDIENTE', 'EN_CURSO', 'REALIZADA', 'DEVUELTA');

-- CreateEnum
CREATE TYPE "ContentPlanStatus" AS ENUM ('PLANIFICACION', 'EN_APROBACION', 'ACTIVO', 'FINALIZADO');

-- CreateEnum
CREATE TYPE "ContentItemStatus" AS ENUM ('BORRADOR', 'EN_REVISION', 'APROBADO', 'PUBLICADO', 'REALIZADO', 'EN_PRODUCCION', 'DEVUELTO');

-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('ESCRITO', 'UNO_A_UNO');

-- CreateEnum
CREATE TYPE "EmisorType" AS ENUM ('BRAIN_STUDIO', 'FRANCISCO_VILLA');

-- CreateEnum
CREATE TYPE "CurrencyType" AS ENUM ('COP', 'USD');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('BORRADOR', 'ACTIVA');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EDITOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "avatarUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "bio" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "relatedId" TEXT,
    "type" TEXT,
    "resourceId" TEXT,
    "url" TEXT,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneralChatMessage" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneralChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aiInstructions" TEXT,
    "adAccountId" TEXT,
    "facebookPageId" TEXT,
    "instagramBusinessId" TEXT,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Board" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Board_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardItem" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "type" "BoardItemType" NOT NULL,
    "contentUrl" TEXT,
    "assetUrl" TEXT,
    "metadata" JSONB,
    "positionX" INTEGER NOT NULL DEFAULT 0,
    "positionY" INTEGER NOT NULL DEFAULT 0,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPlan" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "ContentPlanStatus" NOT NULL DEFAULT 'PLANIFICACION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "ownerId" TEXT,
    "internalNotes" TEXT,
    "shareToken" TEXT,

    CONSTRAINT "ContentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "copyText" TEXT NOT NULL,
    "captionText" TEXT NOT NULL,
    "publishDate" TIMESTAMP(3) NOT NULL,
    "mediaUrl" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ContentItemStatus" NOT NULL DEFAULT 'BORRADOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "assetsLinks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "internalNotes" TEXT,
    "comments" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "email" TEXT,
    "avatarUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,
    "desktopX" INTEGER,
    "desktopY" INTEGER,
    "statusMessage" TEXT,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalEvent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "memberIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recurrence" TEXT,
    "recurrenceEnd" TIMESTAMP(3),
    "meetingLink" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeletedTaskLog" (
    "id" TEXT NOT NULL,
    "originalTaskId" TEXT NOT NULL,
    "taskTitle" TEXT NOT NULL,
    "clientId" TEXT,
    "deletedById" TEXT,
    "reason" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeletedTaskLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "assigneeId" TEXT,
    "comments" TEXT,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "creatorId" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDIENTE',
    "isPriority" BOOLEAN NOT NULL DEFAULT false,
    "isSpecial" BOOLEAN NOT NULL DEFAULT false,
    "referenceUrl" TEXT,
    "specialType" TEXT,
    "contentItemId" TEXT,
    "aiCategory" TEXT,
    "aiComplexity" TEXT,
    "returnCount" INTEGER NOT NULL DEFAULT 0,
    "isReturned" BOOLEAN NOT NULL DEFAULT false,
    "returnedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandAsset" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "BrandAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientFile" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bucketUrl" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Entregable',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mimeType" TEXT,
    "size" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientLink" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientTask" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "dueDate" TIMESTAMP(3),
    "assigneeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientAnnouncement" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackRecord" (
    "id" TEXT NOT NULL,
    "collaboratorId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "type" "FeedbackType" NOT NULL DEFAULT 'ESCRITO',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "strengths" TEXT NOT NULL,
    "improvementAreas" TEXT NOT NULL,
    "actionItems" TEXT NOT NULL,
    "privateNote" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyContext" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "vectorEmbeddings" vector(3072),
    "type" TEXT NOT NULL DEFAULT 'TEXT',
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "clientId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationConfig" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "storageState" JSONB,
    "monitoredChats" JSONB,
    "lastRun" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowMessage" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlowMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalAnnouncement" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GlobalAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyIntegration" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "externalId" TEXT,
    "alias" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "clientId" TEXT,
    "credentials" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCatalog" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "valor_neto" DECIMAL(65,30) NOT NULL,
    "valor_neto_actual" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "ServiceCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "consecutive" SERIAL NOT NULL,
    "uuid_slug" TEXT NOT NULL,
    "emisor_type" "EmisorType" NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'ACTIVA',
    "client_name" TEXT NOT NULL,
    "client_company" TEXT,
    "client_email" TEXT NOT NULL,
    "client_phone" TEXT NOT NULL DEFAULT '',
    "is_tax_exempt" BOOLEAN NOT NULL DEFAULT false,
    "items" JSONB NOT NULL,
    "currency" "CurrencyType" NOT NULL DEFAULT 'COP',
    "subtotal" DECIMAL(65,30) NOT NULL,
    "tax_amount" DECIMAL(65,30) NOT NULL,
    "total_amount" DECIMAL(65,30) NOT NULL,
    "terms_and_conditions" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Client_slug_key" ON "Client"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ContentPlan_shareToken_key" ON "ContentPlan"("shareToken");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_clientId_provider_key" ON "Integration"("clientId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_userId_key" ON "TeamMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCatalog_name_key" ON "ServiceCatalog"("name");

-- CreateIndex
CREATE INDEX "ServiceCatalog_category_idx" ON "ServiceCatalog"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_uuid_slug_key" ON "Quotation"("uuid_slug");

-- AddForeignKey
ALTER TABLE "UserNote" ADD CONSTRAINT "UserNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneralChatMessage" ADD CONSTRAINT "GeneralChatMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Board" ADD CONSTRAINT "Board_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardItem" ADD CONSTRAINT "BoardItem_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPlan" ADD CONSTRAINT "ContentPlan_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPlan" ADD CONSTRAINT "ContentPlan_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ContentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandAsset" ADD CONSTRAINT "BrandAsset_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientFile" ADD CONSTRAINT "ClientFile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientLink" ADD CONSTRAINT "ClientLink_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientTask" ADD CONSTRAINT "ClientTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientTask" ADD CONSTRAINT "ClientTask_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAnnouncement" ADD CONSTRAINT "ClientAnnouncement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackRecord" ADD CONSTRAINT "FeedbackRecord_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackRecord" ADD CONSTRAINT "FeedbackRecord_collaboratorId_fkey" FOREIGN KEY ("collaboratorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyContext" ADD CONSTRAINT "AgencyContext_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowMessage" ADD CONSTRAINT "FlowMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowMessage" ADD CONSTRAINT "FlowMessage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyIntegration" ADD CONSTRAINT "AgencyIntegration_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
