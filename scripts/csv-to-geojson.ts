import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse';
import { brotliCompress } from 'zlib';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const brotliCompressAsync = promisify(brotliCompress);

interface CSVRow {
	[key: string]: string | number;
	Latitude: number;
	Longitude: number;
	UID: string;
}

function cleanFieldName(key: string): string {
	return key.replace(/^\uFEFF/, '').trim();
}

async function compressWithBrotli(data: string): Promise<Buffer> {
	return brotliCompressAsync(Buffer.from(data));
}

async function writeCompressedJSON(filePath: string, data: any): Promise<void> {
	const jsonString = JSON.stringify(data);

	// Write uncompressed version
	fs.writeFileSync(filePath, jsonString, {
		encoding: 'utf8'
	});

	// Write Brotli compressed version with metadata
	const compressed = await compressWithBrotli(jsonString);
	fs.writeFileSync(`${filePath}.br`, compressed, {
		encoding: 'binary'
	});

	// Create a metadata file for the compressed version
	const metadata = {
		contentType: 'application/json',
		contentEncoding: 'br',
		originalSize: jsonString.length,
		compressedSize: compressed.length
	};
	fs.writeFileSync(`${filePath}.br.meta`, JSON.stringify(metadata, null, 2));
}

async function processCSV(inputPath: string): Promise<void> {
	const rows: CSVRow[] = [];

	return new Promise((resolve, reject) => {
		fs.createReadStream(inputPath)
			.pipe(
				parse({
					columns: true,
					skip_empty_lines: true
				})
			)
			.on('data', (row: any) => {
				const normalizedRow = Object.fromEntries(
					Object.entries(row).map(([key, value]) => [cleanFieldName(key), value])
				);

				if (
					!Object.keys(normalizedRow).some((key) => /latitude/i.test(key)) ||
					!Object.keys(normalizedRow).some((key) => /longitude/i.test(key)) ||
					!Object.keys(normalizedRow).some((key) => /uid/i.test(key))
				) {
					console.error(`CSV ${inputPath} missing required columns`);
					console.error('Required: Latitude, Longitude, UID');
					console.error('Found:', Object.keys(normalizedRow));
					process.exit(1);
				}

				const latKey = Object.keys(normalizedRow).find((key) => /latitude/i.test(key))!;
				const lonKey = Object.keys(normalizedRow).find((key) => /longitude/i.test(key))!;
				const uidKey = Object.keys(normalizedRow).find((key) => /uid/i.test(key))!;

				const processedRow: CSVRow = {
					Latitude: parseFloat(normalizedRow[latKey]),
					Longitude: parseFloat(normalizedRow[lonKey]),
					UID: String(normalizedRow[uidKey])
				};

				for (const [key, value] of Object.entries(row)) {
					if (!['Latitude', 'Longitude', 'UID'].includes(key)) {
						processedRow[key] = isNaN(Number(value)) ? String(value) : Number(value);
					}
				}

				rows.push(processedRow);
			})
			.on('end', async () => {
				const fullGeoJSON = createFullGeoJSON(rows);
				const strippedGeoJSON = createStrippedGeoJSON(rows);

				const baseName = path.basename(inputPath, '.csv');
				const fullPath = path.join(path.dirname(inputPath), `${baseName}.geojson`);
				const minimalPath = path.join(path.dirname(inputPath), `${baseName}-minimal.geojson`);

				await writeCompressedJSON(fullPath, fullGeoJSON);
				await writeCompressedJSON(minimalPath, strippedGeoJSON);

				resolve();
			})
			.on('error', reject);
	});
}

function createFullGeoJSON(rows: CSVRow[]): GeoJSON.FeatureCollection {
	return {
		type: 'FeatureCollection',
		features: rows.map((row) => ({
			type: 'Feature',
			geometry: {
				type: 'Point',
				coordinates: [row.Longitude, row.Latitude]
			},
			properties: Object.fromEntries(
				Object.entries(row)
					.filter(([key]) => !['Latitude', 'Longitude', 'UID'].includes(key))
					.map(([key, value]) => [cleanFieldName(key), value])
			)
		}))
	};
}

function createStrippedGeoJSON(rows: CSVRow[]): GeoJSON.FeatureCollection {
	return {
		type: 'FeatureCollection',
		features: rows.map((row) => ({
			type: 'Feature',
			geometry: {
				type: 'Point',
				coordinates: [Number(row.Longitude.toFixed(5)), Number(row.Latitude.toFixed(5))]
			},
			properties: {
				UID: row.UID
			}
		}))
	};
}

async function processAllCSVs(staticFolderPath: string): Promise<void> {
	const files = fs.readdirSync(staticFolderPath);
	const csvFiles = files.filter((file) => path.extname(file).toLowerCase() === '.csv');

	for (const csvFile of csvFiles) {
		const fullPath = path.join(staticFolderPath, csvFile);
		console.log(`Processing ${csvFile}...`);
		await processCSV(fullPath);
		console.log(`Finished processing ${csvFile}`);
	}
}

const staticFolderPath = path.join(__dirname, '..', 'static');

processAllCSVs(staticFolderPath)
	.then(() => console.log('All CSV files processed'))
	.catch((err) => console.error('Error:', err.message));
