# IRA/BIL Project Map

Grist's interactive web application for visualizing Inflation Reduction Act (IRA) and bipartisan infrastructure law (BIL) projects across the United States. Built with SvelteKit and MapLibre GL. [View the live map here.](https://grist.org/accountability/climate-infrastructure-ira-bil-map-tool/)

## Features

- 🗺️ Interactive map visualization of IRA/BIL projects
- 🔍 Location-based search with customizable radius
- 📊 Project details with multi-project popup support
- 📱 Responsive design for both desktop and mobile
- 🎨 Multiple visualization modes (funding source, agency, category)
- 💨 Fast vector tile rendering using PMTiles

## Prerequisites

- [Node.js](https://nodejs.org/) (Latest LTS version recommended)
- [pnpm](https://pnpm.io/) (v9.15.4 or later)

## Getting Started

1. Clone the repository:

   ```bash
   git clone https://github.com/Grist-Data-Desk/ira-tracker
   cd ira-tracker
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Start the development server:

   ```bash
   pnpm dev
   ```

4. Open your browser and navigate to `http://localhost:5173`

## Available Scripts

### Development

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm build:cdn` - Build for production using CDN assets
- `pnpm preview` - Preview production build
- `pnpm preview:cdn` - Preview production build using CDN assets

### Code Quality

- `pnpm check` - Run TypeScript checks
- `pnpm check:watch` - Run TypeScript checks in watch mode
- `pnpm format` - Format code with Prettier
- `pnpm lint` - Run linting checks and Prettier verification

### Data Processing Pipeline

- `pnpm gen:geojson` - Generate GeoJSON from CSV data
- `pnpm gen:pmtiles` - Convert GeoJSON to PMTiles format
- `pnpm upload:geojson` - Upload processed GeoJSON to storage
- `pnpm upload:pmtiles` - Upload PMTiles to storage
- `pnpm upload:styles` - Upload map styles
- `pnpm process-all` - Run full data processing pipeline

### Deployment

- `pnpm publish:app` - Deploy the application
- `pnpm build-and-publish` - Build with CDN configuration and deploy in one step

## Technology Stack

- [SvelteKit](https://kit.svelte.dev/) - Web application framework
- [MapLibre GL JS](https://maplibre.org/) - Mapping library
- [PMTiles](https://github.com/protomaps/PMTiles) - Efficient tile storage format
- [TailwindCSS](https://tailwindcss.com/) - Styling
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Digital Ocean Spaces](https://www.digitalocean.com/products/spaces) - Data storage and CDN
- [Turf.js](https://turfjs.org/) - Geospatial analysis
- [KDBush](https://github.com/mourner/kdbush) - Spatial indexing

## Project Structure

- `/src` - Application source code
  - `/routes` - SvelteKit routes, including main map page
  - `/lib` - Shared components and utilities
    - `/components` - Reusable UI components
      - `/credits` - Credit and note components
      - `/search` - Search-related components
      - `/legend` - Map legend components
    - `/types` - TypeScript type definitions
    - `/utils` - Utility functions, constants, and configuration
- `/scripts` - Data processing and deployment scripts
  - `/src` - TypeScript source code for data processing
  - `/data` - Data files
    - `/raw` - Input data files (CSV, raw GeoJSON)
    - `/processed` - Generated files (PMTiles, compressed GeoJSON)
  - `/styles` - Map style configuration
- `/static` - Static assets (favicon, etc.)

## Methods

The `project-similarity.py` script is designed to merge additional project CSVs into the main Biden White House IRA/BIL project database, handling differing schemas and deduplicating entries.

The script normalizes state names and extracts key identifiers from different CSV formats (i.e. those from BIA, DOE, DOI, EPA, NOAA, and USBR). It calculates the Haversine distance between geographic points and normalizes text for comparison. The similarity score between projects is calculated based on geographic location, state, funding source, project name, description, funding amount, and agency. The score is determined by comparing these attributes and assigning points based on their similarity, with geographic location and project name being the most heavily weighted factors.

To optimize the process, the script creates spatial and state indices for fast lookups and precomputes [TF-IDF features](https://www.geeksforgeeks.org/understanding-tf-idf-term-frequency-inverse-document-frequency/) for project names and descriptions. It then processes input files in chunks, identifying new projects and those requiring manual review. Similar projects are found using spatial and text indexing, and detailed similarity calculations are performed for candidates. The script formats new projects for inclusion in the main CSV and writes the updated main project list and review list to output files.

## Credits

Development by [Clayton Aldern](https://github.com/clayton-aldern) for [Grist](https://grist.org). Project structure and additional development by [Parker Ziegler](https://github.com/parkerziegler). Results table component adapted from [cartokit](https://github.com/parkerziegler/cartokit).
