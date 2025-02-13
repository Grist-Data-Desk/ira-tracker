import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse';
import { brotliCompress } from 'zlib';
import { promisify } from 'util';
import type { FeatureCollection } from 'geojson';

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

	fs.writeFileSync(filePath, jsonString, {
		encoding: 'utf8'
	});

	const compressed = await compressWithBrotli(jsonString);
	fs.writeFileSync(`${filePath}.br`, compressed, {
		encoding: 'binary'
	});

	const metadata = {
		contentType: 'application/json',
		contentEncoding: 'br',
		originalSize: jsonString.length,
		compressedSize: compressed.length
	};
	fs.writeFileSync(`${filePath}.br.meta`, JSON.stringify(metadata, null, 2));
}

async function processCSV(inputPath: string, outputDir: string): Promise<void> {
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
					Latitude: parseFloat(normalizedRow[latKey] as string),
					Longitude: parseFloat(normalizedRow[lonKey] as string),
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
				const fullPath = path.join(outputDir, `${baseName}.geojson`);
				const minimalPath = path.join(outputDir, `${baseName}-minimal.geojson`);

				await writeCompressedJSON(fullPath, fullGeoJSON);
				await writeCompressedJSON(minimalPath, strippedGeoJSON);

				resolve();
			})
			.on('error', reject);
	});
}

function createFullGeoJSON(rows: CSVRow[]): FeatureCollection {
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

function createStrippedGeoJSON(rows: CSVRow[]): FeatureCollection {
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

const inputPath = path.join(__dirname, '../../scripts/data/raw/projects.csv');
const outputDir = path.join(__dirname, '../../scripts/data/processed');

console.log(`Processing ${path.basename(inputPath)}...`);
processCSV(inputPath, outputDir)
	.then(() => console.log('CSV processing complete'))
	.catch((err: Error) => console.error('Error:', err.message));
