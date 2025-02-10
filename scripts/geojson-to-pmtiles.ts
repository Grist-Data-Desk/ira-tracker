import { exec } from "node:child_process";
import path from "node:path";
import url from "node:url";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

const files: string[] = [
  "../static/projects.geojson",
  "../static/reservations.geojson",
  "../static/reservation-labels.geojson"
];

interface ExecError extends Error {
  code?: number;
}

/**
 * Generate PMTiles archive for project dataset.
 */
const main = async (): Promise<void> => {
  for await (const file of files) {
    const name = path.parse(file).name;
    const filePath = path.resolve(__dirname, file);
    const outFile = file.replace(".geojson", ".pmtiles");
    const outFilePath = path.resolve(__dirname, outFile);

    const cmd = `tippecanoe -zg -o ${outFilePath} -l ${name} --drop-densest-as-needed --extend-zooms-if-still-dropping --force ${filePath}`;
    console.log(`Generating PMTiles for ${file}.`);

    exec(cmd, (err: ExecError | null, stdout: string, stderr: string) => {
      if (err) {
        console.error(`Failed to convert input file ${file} to PMTiles.`, err);
        return;
      }

      console.log(stdout);
      console.error(stderr);
    });
  }
};

main().catch(console.error);
