import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as url from "node:url";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
const PMTILES_PATH = "ira-bil/data/pmtiles";

/**
 * Store PMTiles archives in the Grist DigitalOcean Spaces bucket.
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

  const tilesets = (
    await fs.readdir(path.resolve(__dirname, "../static"))
  )
    .filter((file) => path.extname(file) === ".pmtiles")
    .map((file) => path.parse(file).name);

  for (const tileset of tilesets) {
    console.log(`Uploading ${tileset}.pmtiles.`);

    const file = await fs.readFile(
      path.resolve(__dirname, `../static/${tileset}.pmtiles`)
    );
    const putObjectCommand = new PutObjectCommand({
      Bucket: "grist",
      Key: `${PMTILES_PATH}/${tileset}.pmtiles`,
      Body: file,
      ACL: "public-read",
    });
    try {
      const response = await s3Client.send(putObjectCommand);
      console.log(`Successfully uploaded ${tileset}.pmtiles`);
      console.log(response);
    } catch (error) {
      console.error(error);
    }
  }
}

main(); 