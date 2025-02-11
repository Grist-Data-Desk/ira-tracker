import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as url from 'node:url';

import {
	PutObjectCommand,
	DeleteObjectsCommand,
	S3Client,
	ListObjectsCommand
} from '@aws-sdk/client-s3';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const IRA_MAP_PATH = 'ira-bil/interactives/ira-bil-map/_app';

/**
 * Delete all objects in the ira-bil-map/_app directory from the Grist Digital
 * Ocean Spaces bucket.
 *
 * @param s3Client – The S3 client instance.
 */
async function deleteMap(s3Client: S3Client): Promise<void> {
	try {
		// List all objects in the ira-bil-map/_app directory.
		const listObjectsCommand = new ListObjectsCommand({
			Bucket: 'grist',
			Prefix: IRA_MAP_PATH
		});

		// Grab the contents and delete them in a single request.
		const { Contents } = await s3Client.send(listObjectsCommand);

		if (!Contents) {
			console.log(`No objects found at ${IRA_MAP_PATH}. Moving on.`);
			return;
		}

		const deleteObjectsCommand = new DeleteObjectsCommand({
			Bucket: 'grist',
			Delete: {
				Objects: Contents.map(({ Key }) => ({ Key })),
				Quiet: false
			}
		});

		await s3Client.send(deleteObjectsCommand);

		console.log(`Successfully deleted objects at ${IRA_MAP_PATH}.`);
	} catch (error) {
		console.error(`Failed to delete objects at ${IRA_MAP_PATH}. Error: `, error);
	}
}

/**
 * Derive the Content-Type header from a file's extension.
 *
 * @param file — The name of the file on disk.
 * @returns – The appropriate Content-Type header for the file type.
 */
function deriveContentType(file: string): string {
	const ext = path.extname(file);

	switch (ext) {
		case '.js':
			return 'text/javascript';
		case '.css':
			return 'text/css';
		case '.json':
			return 'application/json';
		case '.html':
			return 'text/html';
		case '.svg':
			return 'image/svg+xml';
		case '.png':
			return 'image/png';
		case '.jpg':
		case '.jpeg':
			return 'image/jpeg';
		default:
			console.warn(`Attempting to upload file with unknown extension: ${ext}.`);
			return 'application/octet-stream';
	}
}

/**
 * Deploy the source code located in the build/_app directory to the Grist Digital
 * Ocean Spaces bucket.
 */
async function main(): Promise<void> {
	const accessKeyId = process.env.DO_SPACES_KEY;
	const secretAccessKey = process.env.DO_SPACES_SECRET;

	if (!accessKeyId || !secretAccessKey) {
		throw new Error('DO_SPACES_KEY and DO_SPACES_SECRET environment variables must be set');
	}

	const s3Client = new S3Client({
		endpoint: 'https://nyc3.digitaloceanspaces.com/',
		forcePathStyle: false,
		region: 'nyc3',
		credentials: {
			accessKeyId,
			secretAccessKey
		}
	});

	console.log(`Deleting objects at ${IRA_MAP_PATH}`);
	await deleteMap(s3Client);

	const files = await fs.readdir(path.resolve(__dirname, '../build/_app'), { recursive: true });

	console.log(`Uploading build artifacts from build/_app.`);
	for (const file of files) {
		const filePath = path.resolve(__dirname, '../build/_app', file);

		if ((await fs.lstat(filePath)).isDirectory()) {
			continue;
		}

		const Body = await fs.readFile(filePath);
		const putObjectCommand = new PutObjectCommand({
			Bucket: 'grist',
			Key: `${IRA_MAP_PATH}/${file}`,
			Body,
			ACL: 'public-read',
			ContentType: deriveContentType(file)
		});

		try {
			const response = await s3Client.send(putObjectCommand);
			console.log(`Successfully uploaded ${file}`);
			console.log(response);
		} catch (error) {
			console.error(error);
		}
	}
}

main();
