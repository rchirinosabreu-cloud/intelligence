import pg from "pg";
import { pathToFileURL } from "node:url";

export async function ensureTeamChatSchema(client) {
  await client.query("BEGIN");
  try {
    await client.query(
      "SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='90s'",
    );
    await client.query("SELECT pg_advisory_xact_lock(20260916,10)");
    await client.query(`CREATE TABLE IF NOT EXISTS "TeamChatChannel" (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, "isPrivate" BOOLEAN NOT NULL DEFAULT false,
      "isArchived" BOOLEAN NOT NULL DEFAULT false, version INTEGER NOT NULL DEFAULT 1,
      "createdById" TEXT REFERENCES "User"(id), "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    INSERT INTO "TeamChatChannel"(id,name) VALUES('general','General') ON CONFLICT(id) DO NOTHING;
    CREATE TABLE IF NOT EXISTS "TeamChatMember" (
      "channelId" TEXT NOT NULL REFERENCES "TeamChatChannel"(id), "userId" TEXT NOT NULL REFERENCES "User"(id),
      "readSeq" BIGINT NOT NULL DEFAULT 0, muted BOOLEAN NOT NULL DEFAULT false,
      PRIMARY KEY("channelId","userId")
    );
    CREATE INDEX IF NOT EXISTS "TeamChatMember_user_idx" ON "TeamChatMember"("userId");
    ALTER TABLE "GeneralChatMessage" ADD COLUMN IF NOT EXISTS "channelId" TEXT NOT NULL DEFAULT 'general' REFERENCES "TeamChatChannel"(id);
    ALTER TABLE "GeneralChatMessage" ADD COLUMN IF NOT EXISTS "contentFormat" TEXT NOT NULL DEFAULT 'TEXT';
    ALTER TABLE "GeneralChatMessage" ADD COLUMN IF NOT EXISTS "searchText" TEXT NOT NULL DEFAULT '';
    ALTER TABLE "GeneralChatMessage" ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE "GeneralChatMessage" ADD COLUMN IF NOT EXISTS "sentSeq" BIGINT NOT NULL DEFAULT 0;
    ALTER TABLE "GeneralChatMessage" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMPTZ;
    ALTER TABLE "GeneralChatMessage" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;
    ALTER TABLE "GeneralChatMessage" ADD COLUMN IF NOT EXISTS "replyToId" TEXT REFERENCES "GeneralChatMessage"(id);
    ALTER TABLE "GeneralChatMessage" ADD COLUMN IF NOT EXISTS forwarded BOOLEAN NOT NULL DEFAULT false;
    CREATE INDEX IF NOT EXISTS "GeneralChatMessage_channel_page_idx" ON "GeneralChatMessage"("channelId","createdAt",id);
    CREATE INDEX IF NOT EXISTS "GeneralChatMessage_channel_unread_idx" ON "GeneralChatMessage"("channelId","sentSeq") WHERE "deletedAt" IS NULL;
    CREATE INDEX IF NOT EXISTS "GeneralChatMessage_reply_idx" ON "GeneralChatMessage"("replyToId");
    CREATE TABLE IF NOT EXISTS "TeamChatUpload" (
      id TEXT PRIMARY KEY,"ownerId" TEXT NOT NULL REFERENCES "User"(id),"channelId" TEXT NOT NULL REFERENCES "TeamChatChannel"(id),
      "requestId" TEXT NOT NULL,fingerprint TEXT NOT NULL,"storageKey" TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,size INTEGER NOT NULL CHECK(size>0 AND size<=104857600),"mimeType" TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'READY' CHECK(state IN ('READY','DELETING')),"createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE("ownerId","requestId")
    );
    CREATE INDEX IF NOT EXISTS "TeamChatUpload_staging_idx" ON "TeamChatUpload"("createdAt",state);
    CREATE INDEX IF NOT EXISTS "TeamChatUpload_channel_idx" ON "TeamChatUpload"("channelId");
    CREATE TABLE IF NOT EXISTS "TeamChatAttachment" (
      "messageId" TEXT NOT NULL REFERENCES "GeneralChatMessage"(id),"uploadId" TEXT NOT NULL REFERENCES "TeamChatUpload"(id),
      position INTEGER NOT NULL,PRIMARY KEY("messageId","uploadId")
    );
    CREATE INDEX IF NOT EXISTS "TeamChatAttachment_upload_idx" ON "TeamChatAttachment"("uploadId");
    CREATE TABLE IF NOT EXISTS "TeamChatReaction" (
      "messageId" TEXT NOT NULL REFERENCES "GeneralChatMessage"(id),"userId" TEXT NOT NULL REFERENCES "User"(id),emoji TEXT NOT NULL,
      PRIMARY KEY("messageId","userId",emoji)
    );
    CREATE INDEX IF NOT EXISTS "TeamChatReaction_user_idx" ON "TeamChatReaction"("userId");
    CREATE TABLE IF NOT EXISTS "TeamChatEvent" (
      seq BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,"channelId" TEXT NOT NULL REFERENCES "TeamChatChannel"(id),
      "messageId" TEXT REFERENCES "GeneralChatMessage"(id),type TEXT NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "TeamChatEvent_channel_idx" ON "TeamChatEvent"("channelId",seq);
    CREATE INDEX IF NOT EXISTS "TeamChatEvent_message_idx" ON "TeamChatEvent"("messageId");
    CREATE TABLE IF NOT EXISTS "TeamChatRequest" (
      "actorId" TEXT NOT NULL REFERENCES "User"(id),"requestId" TEXT NOT NULL,fingerprint TEXT NOT NULL,
      result JSONB NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY("actorId","requestId")
    );
    CREATE TABLE IF NOT EXISTS "TeamChatPushDelivery" (
      "notificationId" TEXT PRIMARY KEY REFERENCES "Notification"(id),attempts INTEGER NOT NULL DEFAULT 0,
      "nextAttemptAt" TIMESTAMPTZ NOT NULL DEFAULT now(),"deliveredAt" TIMESTAMPTZ
    );`);
    await client.query("COMMIT");
  } catch (error) {
    await client
      .query("ROLLBACK")
      .catch((e) => console.error("[TeamChat schema] rollback:", e.message));
    throw error;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
  });
  try {
    await client.connect();
    await ensureTeamChatSchema(client);
    console.log(
      "[TeamChat schema] Ready; existing message IDs, authors and dates preserved.",
    );
  } catch (error) {
    console.error("[TeamChat schema]", error.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
