# IRA/BIL Project Map

Grist's interactive web application for visualizing Inflation Reduction Act (IRA) and Bipartisan Infrastructure Law (BIL) projects across the United States. Built with SvelteKit and MapLibre GL.

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
- `pnpm preview` - Preview production build

### Code Quality

- `pnpm check` - Run TypeScript checks
- `pnpm check:watch` - Run TypeScript checks in watch mode
- `pnpm format` - Format code with Prettier
- `pnpm lint` - Run linting checks

### Data Processing Pipeline

- `pnpm gen:geojson` - Generate GeoJSON from CSV data
- `pnpm gen:pmtiles` - Convert GeoJSON to PMTiles format
- `pnpm upload:geojson` - Upload processed GeoJSON to storage
- `pnpm upload:pmtiles` - Upload PMTiles to storage
- `pnpm upload:styles` - Upload map styles
- `pnpm process-all` - Run full data processing pipeline

### Deployment

- `pnpm publish:app` - Deploy the application
- `pnpm build-and-publish` - Build and deploy in one step

## Technology Stack

- [SvelteKit](https://kit.svelte.dev/) - Web application framework
- [MapLibre GL JS](https://maplibre.org/) - Mapping library
- [PMTiles](https://github.com/protomaps/PMTiles) - Efficient tile storage format
- [TailwindCSS](https://tailwindcss.com/) - Styling
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Digital Ocean Spaces](https://www.digitalocean.com/products/spaces) - Data storage

## Project Structure

- `/src` - Application source code
  - `/routes` - SvelteKit routes
  - `/lib` - Shared components and utilities
    - `/components` - Reusable UI components
      - `/search` - Search-related components
      - `/legend` - Map legend components
    - `/types` - TypeScript type definitions
    - `/utils` - Utility functions, constants, and configuration
- `/scripts` - Data processing and deployment scripts
- `/static` - Static assets

## Credits

Development by [Clayton Aldern](https://github.com/clayton-aldern) for [Grist](https://grist.org). Project structure by [Parker Ziegler](https://github.com/parkerziegler). Results table component adapted from [cartokit](https://github.com/parkerziegler/cartokit).
