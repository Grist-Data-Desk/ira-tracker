import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as url from "node:url";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
const GEOJSON_PATH = "ira-bil/data/geojson";

/**
 * Store GeoJSON files (both compressed and uncompressed) in the DigitalOcean Spaces bucket.
 */
async function main(): Promise<void> {
  const s3Client = new S3Client({
    endpoint: "https://nyc3.digitaloceanspaces.com/",
    forcePathStyle: false,
    region: "nyc3",
    credentials: {
      accessKeyId: process.env.DO_SPACES_KEY || '',
      secretAccessKey: process.env.DO_SPACES_SECRET || '',
    },
  });

  // Find all GeoJSON files (both compressed and uncompressed)
  const geojsonFiles = (await fs.readdir(path.resolve(__dirname, "../static")))
    .filter((file) => file.endsWith('.geojson') || file.endsWith('.geojson.br'))
    .filter((file) => !file.endsWith('.meta')); // Exclude metadata files

  for (const file of geojsonFiles) {
    console.log(`Uploading ${file}`);
    
    const filePath = path.resolve(__dirname, `../static/${file}`);
    const fileContent = await fs.readFile(filePath);
    
    const isCompressed = file.endsWith('.br');
    let contentType = 'application/json';
    let contentEncoding: string | undefined;
    
    if (isCompressed) {
      contentEncoding = 'br';
      // Try to read metadata file if it exists
      try {
        const metaPath = `${filePath}.meta`;
        const metadata = JSON.parse(await fs.readFile(metaPath, 'utf8'));
        contentType = metadata.contentType;
      } catch (err) {
        // If no metadata file exists, use defaults
        console.warn(`No metadata file found for ${file}, using defaults`);
      }
    }

    const putObjectCommand = new PutObjectCommand({
      Bucket: "grist",
      Key: `${GEOJSON_PATH}/${file}`,
      Body: fileContent,
      ACL: "public-read",
      ContentType: contentType,
      ...(contentEncoding && { ContentEncoding: contentEncoding }),
      CacheControl: 'public, max-age=31536000', // Cache for 1 year
    });

    try {
      const response = await s3Client.send(putObjectCommand);
      console.log(`Successfully uploaded ${file}`);
      console.log(response);
    } catch (error) {
      console.error(`Failed to upload ${file}:`, error);
    }
  }
}

main().catch(console.error); 