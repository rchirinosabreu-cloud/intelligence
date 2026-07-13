import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function downloadFile(key, localPath) {
    const endpoint = process.env.AWS_ENDPOINT_URL || "https://t3.storageapi.dev";
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const bucket = process.env.AWS_S3_BUCKET_NAME || "chat-evidence";

    if (!accessKeyId || !secretAccessKey) {
        console.warn(`S3 Credentials missing. Cannot download ${key} from S3.`);
        return false;
    }

    const s3Client = new S3Client({
        endpoint,
        region: "us-east-1",
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: true,
    });

    console.log(`Downloading ${key} from S3 bucket ${bucket}...`);
    try {
        const response = await s3Client.send(new GetObjectCommand({
            Bucket: bucket,
            Key: key,
        }));

        const chunks = [];
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        fs.mkdirSync(path.dirname(localPath), { recursive: true });
        fs.writeFileSync(localPath, buffer);
        console.log(`Successfully saved ${key} to ${localPath}`);
        return true;
    } catch (error) {
        console.error(`Failed to download ${key} from S3:`, error.message);
        return false;
    }
}

async function main() {
    const dataDir = path.join(__dirname, '../data');
    await downloadFile('Financials/FINANZAS BRAIN STUDIO 2026.xlsx', path.join(dataDir, 'FINANZAS_BRAIN_STUDIO_2026.xlsx'));
    await downloadFile('Financials/FINANZAS BRAIN STUDIO 2021- 2025.xlsx', path.join(dataDir, 'FINANZAS_BRAIN_STUDIO_2021_2025.xlsx'));
}

main();
