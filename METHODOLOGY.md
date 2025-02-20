# Data Processing Methodology

This document outlines the methodology used for processing and deduplicating project data from various federal sources into a unified database of IRA (Inflation Reduction Act) and BIL (Bipartisan Infrastructure Law) projects.

## Overview

The data processing pipeline consists of these steps:
1. Project deduplication and merging (`project-similarity.py`)
2. USAspending data integration (`transform-and-merge.py`)
3. Map data generation (`csv-to-geojson.ts` and `geojson-to-pmtiles.ts`)

## 1. Project Deduplication and Merging

### Data Sources
Beginning with the Biden White House IRA/BIL project database, the script processes project data from multiple federal agencies and bureaus, including:
- Bureau of Indian Affairs (BIA)
- Department of Energy (DOE)
- Department of Interior (DOI)
- Environmental Protection Agency (EPA)
- National Oceanic and Atmospheric Administration (NOAA)
- US Bureau of Reclamation (USBR)

### Deduplication Process

#### A. Feature Extraction
For each project, the following key identifiers are extracted and normalized:
- Project name and description
- Geographic coordinates (latitude/longitude)
- State location
- Funding amount and source
- Agency and bureau information
- Program details

#### B. Similarity Scoring
Projects are compared using a weighted scoring system (0-100) that considers:

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
The script employs several optimization strategies:
- [R-tree spatial indexing](https://www.geeksforgeeks.org/introduction-to-r-tree/) for efficient geographic queries
- State-based indexing for quick location filtering
- [TF-IDF](https://www.geeksforgeeks.org/understanding-tf-idf-term-frequency-inverse-document-frequency/) vectorization for text similarity comparisons
- Parallel processing for large datasets

#### D. Decision Making
Projects are categorized based on similarity scores:
- High confidence matches (≥80 points): Considered duplicates
- Medium confidence matches (40-79 points): Flagged for manual review
- Low confidence matches (<40 points): Treated as new unique projects

## 2. USAspending Data Integration

### Process Overview
The second script integrates USAspending assistance and contract data with the deduplicated project database.

#### A. Data Preparation
- Loads the main project database
- Processes USAspending assistance awards
- Processes USAspending contract awards

#### B. Merging Strategy
- Matches records based on unique identifiers:
  - ASST* for assistance awards
  - CONT* for contract awards
- Preserves non-USAspending records
- Maintains original record order

#### C. Financial Calculations
Calculates IIJA (Infrastructure Investment and Jobs Act) outlay percentages:
- For records with both obligated and outlayed amounts:
  - Percent = (Outlayed Amount / Obligated Amount) * 100
- Special cases:
  - Missing both amounts: NA
  - Missing outlay amount: 0%
  - Zero outlay amount: 0%

## 3. Map Data Generation

The final step transforms the processed data into web-optimized map formats using two scripts:

### GeoJSON Generation
The `csv-to-geojson.ts` script:
- Converts processed CSV data into GeoJSON format
- Validates and formats geographic coordinates
- Structures properties for web display

### PMTiles Generation
The `geojson-to-pmtiles.ts` script:
- Converts GeoJSON into PMTiles format
- Optimizes for efficient web loading
- Generates zoom-level specific tiles

## Output Files

The pipeline produces these outputs:
1. Updated main project database with deduplicated records
2. Review file containing potential matches requiring manual verification
3. Final merged dataset with USAspending financial data
4. Map visualization files:
   - GeoJSON files for raw geographic data
   - PMTiles for optimized web delivery

## Notes

- The deduplication process is conservative, preferring to flag uncertain matches for review rather than making incorrect assumptions
- Geographic coordinates are validated to ensure they fall within valid ranges
- Text comparisons use normalized forms (removing common words, standardizing case, etc.)
- The process maintains audit trails by preserving original source information 