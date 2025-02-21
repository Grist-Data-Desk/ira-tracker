# Data Processing Methodology

This document outlines the methodology used for processing and deduplicating project data from various federal sources into a unified database of Inflation Reduction Act (IRA) and bipartisan infrastructure law (BIL) projects.

## Overview

The data processing pipeline consists of three main steps:
1. Project deduplication and merging (`project-similarity.py`)
2. USAspending data integration (`add-usaspending.py`)
3. Map data generation (`csv-to-geojson.ts` and `geojson-to-pmtiles.ts`)

## 1. Project Deduplication and Merging

### Data Sources
Beginning with the Biden White House IRA/BIL project database, the script processes project data from multiple federal agencies and bureaus, including:
- Bureau of Indian Affairs (BIA)
- Department of Energy (DOE)
- Department of Interior (DOI)
- Environmental Protection Agency (EPA)
- National Oceanic and Atmospheric Administration (NOAA), and
- US Bureau of Reclamation (USBR)

### Deduplication Process

#### A. Feature Extraction
For each project, we extract and normalize several key identifiers. These include the project name and description, geographic coordinates (latitude/longitude), state location, funding amount and source, agency and bureau information, and program details.

#### B. Similarity Scoring
Projects are compared using a weighted scoring system that evaluates similarity on a scale of 0-100 points. The scoring system considers multiple factors:

1. Geographic Location (40 points max)
   - <1km distance: 40 points
   - <10km distance: 30 points
   - <50km distance: 15 points
   - <100km distance: 5 points

2. State Match (10 points)
   - Exact state match: 10 points

3. Funding Source (5 points)
   - Matching funding source (IRA/BIL): 5 points

4. Project Name Similarity (30 points max)
   - \>80% similarity: 30 points
   - \>50% similarity: 20 points
   - \>30% similarity: 10 points

5. Project Description Similarity (15 points max)
   - \>70% similarity: 15 points
   - \>40% similarity: 10 points
   - \>20% similarity: 5 points

6. Funding Amount Similarity (5 points)
   - Within 10% of each other: 5 points

7. Agency/Bureau Match (5 points)
   - Exact agency match: 5 points

#### C. Optimization Techniques
The script implements several optimization strategies to handle the computational load efficiently. We use [R-tree spatial indexing](https://www.geeksforgeeks.org/introduction-to-r-tree/) for geographic queries and state-based indexing for quick location filtering. Text similarity comparisons are handled through [TF-IDF vectorization](https://www.geeksforgeeks.org/understanding-tf-idf-term-frequency-inverse-document-frequency/). The system employs parallel processing for large datasets and manages concurrent API calls for location data lookups.

#### D. Location Data Processing
Location data enrichment for new projects is handled through an efficient concurrent processing system. The script uses `ThreadPoolExecutor` to make multiple concurrent API calls to the Census Bureau, with a default of 10 concurrent workers to balance speed and API rate limits. API responses are processed as they complete, rather than waiting for all to finish.

Our selective API usage strategy ensures efficiency by only performing lookups for new projects being added to the database. The system preserves existing location data for projects already in the main White House file and checks for missing fields (Congressional District, state, city, county) before making API calls.

#### E. Decision Making
Our pipeline categorizes projects into three levels based on their similarity scores. Projects with scores of 80 points or higher are considered high confidence matches and treated as duplicates. Those scoring between 40 and 79 points are flagged as medium confidence matches requiring manual review. Projects scoring below 40 points are treated as new unique projects and are added to the database for visualization.

## 2. USAspending Data Integration

### Process Overview
The second phase of our pipeline integrates USAspending assistance and contract data with the deduplicated project database. The process begins by loading the main project database and then processes both USAspending assistance awards and contract awards.

The merging strategy matches records based on unique identifiers, using "ASST*" for assistance awards and "CONT*" for contract awards. The process preserves non-USAspending records and maintains the original record order.

For financial calculations, we compute BIL outlay percentages. For records with both obligated and outlayed amounts from USAspending, the percentage is calculated as `(Outlayed Amount / Obligated Amount) * 100`. Special cases are handled appropriately: Records missing both amounts are marked as NA, those missing outlay amounts or showing zero outlay are marked as 0%.

## 3. Map Data Generation

The final phase transforms the processed data into web-optimized map formats using two distinct processes. First, the `csv-to-geojson.ts` script converts processed CSV data into GeoJSON format, validating and formatting geographic coordinates and structuring properties for web display.

Following this step, the `geojson-to-pmtiles.ts` script converts the GeoJSON into PMTiles format, optimizing it for efficient web loading and generating zoom-level specific tiles.

## Output Files

The pipeline produces these primary outputs:
1. Updated main project database with deduplicated records
2. Review file containing potential matches requiring manual verification
3. Final merged dataset with USAspending financial data
4. Map visualization files:
   - GeoJSON files for raw geographic data
   - PMTiles for optimized web delivery

## Notes

- The deduplication process is conservative, preferring to flag uncertain matches for review rather than making incorrect assumptions
- Text comparisons use normalized forms (removing common words, standardizing case, etc.)
