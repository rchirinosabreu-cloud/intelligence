import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { validateUploadFile } from "../config/security.js";
import { CHAT_FILE_BYTES } from "../lib/teamChatState.js";
import { chatError } from "./teamChatContent.js";

export function detectChatMime(bytes, claimed = "") {
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  const text = bytes.toString("latin1");
  if (/^GIF8[79]a/.test(text)) return "image/gif";
  if (text.startsWith("RIFF") && text.slice(8, 12) === "WEBP")
    return "image/webp";
  if (text.startsWith("RIFF") && text.slice(8, 12) === "WAVE")
    return "audio/wav";
  if (text.startsWith("%PDF-")) return "application/pdf";
  if (text.startsWith("OggS")) return "audio/ogg";
  if (text.startsWith("ID3") || (bytes[0] === 255 && (bytes[1] & 224) === 224))
    return "audio/mpeg";
  if (bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])))
    return claimed.startsWith("audio/") ? "audio/webm" : "video/webm";
  if (text.slice(4, 8) === "ftyp")
    return claimed.startsWith("audio/") ? "audio/mp4" : "video/mp4";
  return "application/octet-stream";
}
export function parseChatRange(value, size) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]))
    throw chatError("Rango inválido.", 416);
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, size - Number(match[2]));
  const end = match[1]
    ? match[2]
      ? Math.min(Number(match[2]), size - 1)
      : size - 1
    : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  )
    throw chatError("Rango no disponible.", 416);
  return { start, end };
}
export async function inspectChatFile(file) {
  try {
    validateUploadFile(file, { maxBytes: CHAT_FILE_BYTES });
  } catch (error) {
    throw chatError(error.message);
  }
  if (!file.size) throw chatError("El archivo está vacío.");
  const handle = await open(file.path, "r");
  let bytes;
  try {
    const buffer = Buffer.alloc(512);
    const result = await handle.read(buffer, 0, 512, 0);
    bytes = buffer.subarray(0, result.bytesRead);
  } finally {
    await handle.close();
  }
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file.path)) digest.update(chunk);
  return {
    name: file.originalname.replace(/[\r\n\u0000]/g, "").slice(0, 250),
    size: file.size,
    mimeType: detectChatMime(bytes, file.mimetype),
    fingerprint: digest.digest("hex"),
  };
}
export function createChatStorage(env = process.env) {
  let client;
  const s3 = () => {
    if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY)
      throw chatError(
        "El almacenamiento no está configurado. Intenta más tarde.",
        503,
      );
    return (client ||= new S3Client({
      endpoint: env.AWS_ENDPOINT_URL || "https://t3.storageapi.dev",
      region: "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    }));
  };
  const Bucket = env.AWS_S3_BUCKET_NAME || "chat-evidence";
  return {
    async upload(file, metadata) {
      const key = `team-chat/${randomUUID()}`;
      await s3().send(
        new PutObjectCommand({
          Bucket,
          Key: key,
          Body: createReadStream(file.path),
          ContentLength: metadata.size,
          ContentType: metadata.mimeType,
          ContentDisposition: "attachment",
        }),
      );
      return key;
    },
    get: (key, range) =>
      s3().send(
        new GetObjectCommand({
          Bucket,
          Key: key,
          ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
        }),
      ),
    remove: (key) => s3().send(new DeleteObjectCommand({ Bucket, Key: key })),
  };
}
