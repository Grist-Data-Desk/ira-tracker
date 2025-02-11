import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as url from 'node:url';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const STYLE_PATH = 'ira-bil/styles';

/**
 * Store our basemap style in the Grist DigitalOcean Spaces bucket.
 */
const main = async () => {
	const s3Client = new S3Client({
		endpoint: 'https://nyc3.digitaloceanspaces.com/',
		forcePathStyle: false,
		region: 'nyc3',
		credentials: {
			accessKeyId: process.env.DO_SPACES_KEY,
			secretAccessKey: process.env.DO_SPACES_SECRET
		}
	});

	const files = await fs.readdir(path.resolve(__dirname, '../styles'));

	for (const file of files) {
		const Body = await fs.readFile(path.resolve(__dirname, `../styles/${file}`));

		const putObjectCommand = new PutObjectCommand({
			Bucket: 'grist',
			Key: `${STYLE_PATH}/${file}`,
			Body,
			ACL: 'public-read',
			ContentType: 'application/json'
		});

		try {
			const response = await s3Client.send(putObjectCommand);
			console.log(`Successfully uploaded ${file}.`);
			console.log(response);
		} catch (error) {
			console.error(error);
		}
	}
};

main();
