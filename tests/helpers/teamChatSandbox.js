import pg from "pg";
import express from "express";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { ensureTeamChatSchema } from "../../scripts/ensure-team-chat-schema.js";
import { createTeamChatRuntime } from "../../src/services/teamChatRuntime.js";
import {
  createTeamChatRouter,
  createTeamChatMediaRouter,
} from "../../src/routes/api/teamChat.js";

export async function createChatSandbox() {
  const url = new URL(process.env.TEST_DATABASE_URL || "http://invalid");
  if (
    url.hostname !== "127.0.0.1" ||
    url.port !== "55448" ||
    url.pathname !== "/recognition_test" ||
    url.username !== "recognition_test"
  )
    throw new Error(
      "TEST_DATABASE_URL must point to the isolated local cluster.",
    );
  if (!process.env.JWT_SECRET)
    process.env.JWT_SECRET = randomUUID() + randomUUID();
  const schema = `chat_test_${randomUUID().replaceAll("-", "")}`;
  const owner = new pg.Client({ connectionString: url.href });
  await owner.connect();
  await owner.query(`CREATE SCHEMA "${schema}"`);
  const pool = new pg.Pool({
    connectionString: url.href,
    options: `-c search_path=${schema}`,
    max: 8,
  });
  await pool.query(`CREATE TABLE "User"(id TEXT PRIMARY KEY,name TEXT,email TEXT,role TEXT,"isActive" BOOLEAN DEFAULT true,"sessionVersion" INTEGER DEFAULT 0,"mustChangePassword" BOOLEAN DEFAULT false,"avatarUrl" TEXT);
 CREATE TABLE "TeamMember"(id TEXT PRIMARY KEY,"userId" TEXT UNIQUE REFERENCES "User"(id),name TEXT,"avatarUrl" TEXT,"isActive" BOOLEAN DEFAULT true);
 CREATE TABLE "GeneralChatMessage"(id TEXT PRIMARY KEY,content TEXT NOT NULL,"authorId" TEXT REFERENCES "User"(id),"createdAt" TIMESTAMP(3) DEFAULT now());
 CREATE TABLE "Notification"(id TEXT PRIMARY KEY,"userId" TEXT,"message" TEXT,"isRead" BOOLEAN DEFAULT false,"createdAt" TIMESTAMP DEFAULT now(),"type" TEXT,"relatedId" TEXT,"url" TEXT);`);
  const sql = await pool.connect();
  try {
    await ensureTeamChatSchema(sql);
  } finally {
    sql.release();
  }
  const actors = [
    {
      id: "demo-ana",
      name: "Ana · Prueba local",
      role: "ADMIN",
      sessionVersion: 0,
    },
    {
      id: "demo-luis",
      name: "Luis · Prueba local",
      role: "EDITOR",
      sessionVersion: 0,
    },
  ];
  for (const a of actors) {
    await pool.query('INSERT INTO "User"(id,name,role) VALUES($1,$2,$3)', [
      a.id,
      a.name,
      a.role,
    ]);
    await pool.query(
      'INSERT INTO "TeamMember"(id,"userId",name) VALUES($1,$2,$3)',
      [`member-${a.id}`, a.id, a.name],
    );
  }
  const objects = new Map();
  const storage = {
    upload: async (file) => {
      const id = randomUUID();
      objects.set(id, await readFile(file.path));
      return id;
    },
    get: async (id, range) => {
      const b = objects.get(id);
      if (!b) throw new Error("Missing test object");
      return {
        Body: Readable.from(range ? b.subarray(range.start, range.end + 1) : b),
      };
    },
    remove: async (id) => objects.delete(id),
  };
  const runtime = createTeamChatRuntime({ pool, storage });
  runtime.start();
  const app = express();
  app.use(express.json());
  app.use(
    "/api/team-chat-media",
    createTeamChatMediaRouter(() => runtime),
  );
  app.use(
    "/api/team-chat",
    (req, res, next) => {
      const actor = actors.find(
        (a) => req.get("Authorization") === `Bearer ${a.id}`,
      );
      if (!actor)
        return res.status(401).json({ error: "Local test actor required" });
      req.user = actor;
      next();
    },
    createTeamChatRouter(() => runtime),
  );
  return {
    app,
    runtime,
    actors,
    objects,
    pool,
    async close() {
      await runtime.close();
      await pool.end();
      await owner.query(`DROP SCHEMA "${schema}" CASCADE`);
      await owner.end();
    },
  };
}
