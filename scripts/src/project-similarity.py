#!/usr/bin/env python3
"""
Script to merge additional project CSVs into the main WH IRA/BIL project database.
This script handles differing schemas and attempts to deduplicate entries.
"""

import os
import csv
import re
import math
import uuid
import argparse
from datetime import datetime
from pathlib import Path
from tqdm import tqdm
from concurrent.futures import ProcessPoolExecutor
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from rtree import index
from collections import defaultdict

NUM_PROCESSES = os.cpu_count() or 4
CHUNK_SIZE = 100

def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description='Merge additional project CSVs into the main IRA/BIL project database.'
    )
    parser.add_argument(
        '--main', type=str, default='wh-public-projects.csv',
        help='Filename of the main CSV (relative to data/raw)'
    )
    parser.add_argument(
        '--inputs', type=str, nargs='+', required=True,
        help='Filenames of input CSVs to merge (relative to data/raw)'
    )
    parser.add_argument(
        '--output', type=str, default=None,
        help='Output filename (defaults to main-updated-{timestamp}.csv in data/processed)'
    )
    parser.add_argument(
        '--review-output', type=str, default=None,
        help='Filename for projects needing manual review (defaults to review-{timestamp}.csv in data/processed)'
    )
    parser.add_argument(
        '--confidence-threshold', type=float, default=80.0,
        help='Confidence threshold for automatic duplicate detection (default: 80.0)'
    )
    parser.add_argument(
        '--review-threshold', type=float, default=40.0,
        help='Confidence threshold for manual review (default: 40.0)'
    )
    parser.add_argument(
        '--dry-run', action='store_true',
        help='Run without writing output files'
    )
    parser.add_argument(
        '--verbose', action='store_true',
        help='Enable verbose logging'
    )
    return parser.parse_args()


def get_project_root():
    """Get the absolute path to the project root directory."""
    script_dir = Path(os.path.abspath(__file__)).parent 
    return script_dir.parent.parent 


def get_file_paths(args):
    """Get absolute file paths for input and output files."""
    root_dir = get_project_root()
    raw_dir = root_dir / 'scripts' / 'data' / 'raw'
    
    main_path = raw_dir / args.main
    input_paths = [raw_dir / input_file for input_file in args.inputs]
    
    if args.output:
        output_path = raw_dir / args.output
    else:
        output_path = raw_dir / "wh-public-projects-updated.csv"
        
    if args.review_output:
        review_path = raw_dir / args.review_output
    else:
        review_path = raw_dir / "projects-to-review.csv"
        
    return {
        'main': main_path,
        'inputs': input_paths,
        'output': output_path,
        'review': review_path
    }


def load_csv(file_path):
    """Load a CSV file and return a list of dictionaries."""
    with open(file_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        return list(reader)


def clean_funding_amount(value):
    """Clean funding amount values, handling currency and scale indicators."""
    if not value or value == '-':
        return 0.0
    
    value_str = str(value).strip()
    
    value_str = value_str.replace('$', '').replace(',', '')
    
    number_match = re.search(r'(\d+\.?\d*)', value_str)
    if not number_match:
        return 0.0
        
    number = number_match.group(1)
    multiplier = 1.0
    
    if 'M' in value_str or 'million' in value_str.lower():
        multiplier = 1000000
    elif 'K' in value_str or 'thousand' in value_str.lower():
        multiplier = 1000
    elif 'B' in value_str or 'billion' in value_str.lower():
        multiplier = 1000000000
    
    try:
        return float(number) * multiplier
    except ValueError:
        return 0.0


def clean_coordinate(value):
    """Clean coordinate values, ensuring they are valid numbers."""
    if not value:
        return 0.0
    
    try:
        return float(str(value).strip())
    except ValueError:
        return 0.0


def normalize_state(state):
    """Normalize state names to standard two-letter abbreviations."""
    state_map = {
        'ALABAMA': 'AL', 'ALASKA': 'AK', 'ARIZONA': 'AZ', 'ARKANSAS': 'AR',
        'CALIFORNIA': 'CA', 'COLORADO': 'CO', 'CONNECTICUT': 'CT', 'DELAWARE': 'DE',
        'FLORIDA': 'FL', 'GEORGIA': 'GA', 'HAWAII': 'HI', 'IDAHO': 'ID',
        'ILLINOIS': 'IL', 'INDIANA': 'IN', 'IOWA': 'IA', 'KANSAS': 'KS',
        'KENTUCKY': 'KY', 'LOUISIANA': 'LA', 'MAINE': 'ME', 'MARYLAND': 'MD',
        'MASSACHUSETTS': 'MA', 'MICHIGAN': 'MI', 'MINNESOTA': 'MN', 'MISSISSIPPI': 'MS',
        'MISSOURI': 'MO', 'MONTANA': 'MT', 'NEBRASKA': 'NE', 'NEVADA': 'NV',
        'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY',
        'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', 'OHIO': 'OH', 'OKLAHOMA': 'OK',
        'OREGON': 'OR', 'PENNSYLVANIA': 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC',
        'SOUTH DAKOTA': 'SD', 'TENNESSEE': 'TN', 'TEXAS': 'TX', 'UTAH': 'UT',
        'VERMONT': 'VT', 'VIRGINIA': 'VA', 'WASHINGTON': 'WA', 'WEST VIRGINIA': 'WV',
        'WISCONSIN': 'WI', 'WYOMING': 'WY', 'DISTRICT OF COLUMBIA': 'DC',
        'PUERTO RICO': 'PR', 'VIRGIN ISLANDS': 'VI', 'GUAM': 'GU',
        'AMERICAN SAMOA': 'AS', 'NORTHERN MARIANA ISLANDS': 'MP'
    }
    
    if not state:
        return None
        
    if re.match(r'^[A-Z]{2}$', state):
        return state
    
    normalized = state_map.get(state.upper())
    if normalized:
        return normalized
        
    match = re.search(r'\b([A-Z]{2})\b', state.upper())
    if match:
        if match.group(1) in state_map.values():
            return match.group(1)
    
    return state

def extract_identifiers_main(row):
    """Extract key identifiers from the main CSV format."""
    return {
        'Unique ID': row.get('Unique ID', ''),
        'project_name': row.get('Project Name', ''),
        'project_desc': row.get('Project Description', ''),
        'latitude': clean_coordinate(row.get('Latitude')),
        'longitude': clean_coordinate(row.get('Longitude')),
        'state': normalize_state(row.get('State', '')),
        'city': row.get('City', ''),
        'tribe': row.get('Tribe', ''),
        'county': row.get('County', ''),
        'funding_amount': clean_funding_amount(row.get('Funding Amount')),
        'funding_source': row.get('Funding Source', ''),
        'agency': row.get('Agency Name', ''),
        'bureau': row.get('Bureau Name', ''),
        'category': row.get('Category', ''),
        'subcategory': row.get('Subcategory', ''),
        'program_name': row.get('Program Name', ''),
        'program_id': row.get('Program ID', ''),
        'link': row.get('Link', ''),
        'original_row': row
    }


def extract_identifiers_bia(row):
    """Extract key identifiers from the BIA CSV format."""
    location = row.get('location_n', '')
    
    state_match = re.search(r'([A-Z]{2})$', location)
    state = state_match.group(1) if state_match else None
    
    location_parts = location.split(',')
    tribe_or_city = location_parts[0].strip() if location_parts else ''
    
    is_tribe = 'Tribe' in location or 'Nation' in location or 'Reservation' in location
    
    return {
        'project_name': row.get('project', ''),
        'project_desc': row.get('benefits', ''),
        'latitude': clean_coordinate(row.get('POINT_Y')),
        'longitude': clean_coordinate(row.get('POINT_X')),
        'state': normalize_state(state) if state else None,
        'city': '' if is_tribe else tribe_or_city,
        'tribe': tribe_or_city if is_tribe else '',
        'county': '',
        'funding_amount': clean_funding_amount(row.get('proj_am')),
        'funding_source': row.get('fundingtype', ''),
        'agency': 'Department of the Interior',
        'bureau': 'Bureau of Indian Affairs',
        'category': map_bia_category(row.get('proj_type', '')),
        'subcategory': row.get('proj_type', ''),
        'program_name': f"BIA {row.get('proj_type', '')} Program",
        'program_id': f"BIA{row.get('fiscal_year', '')}",
        'link': row.get('hyperlink', ''),
        'original_row': row,
        'source_file': 'bia'
    }


def extract_identifiers_doe(row):
    """Extract key identifiers from the DOE CSV format."""
    if row.get('private', '').lower() == 'yes':
        return None
        
    tech = row.get('tech', '')
    company = row.get('company_name', '')
    project_base = row.get('project', '')
    
    description = f"{project_base} - {company}"
    if tech and tech.lower() != 'other':
        description += f" - {tech} technology"
    
    funding_source = 'IRA' if 'IRA Section' in project_base else 'BIL'
    
    return {
        'project_name': row.get('project', ''),
        'project_desc': description,
        'latitude': clean_coordinate(row.get('latitude')),
        'longitude': clean_coordinate(row.get('longitude')),
        'state': normalize_state(row.get('state', '')),
        'city': row.get('city', ''),
        'tribe': '',
        'county': '',
        'funding_amount': clean_funding_amount(row.get('pubinvest')),
        'funding_source': funding_source,
        'agency': 'Department of Energy',
        'bureau': '',
        'category': map_doe_category(row.get('category', ''), row.get('tech', '')),
        'subcategory': row.get('tech', ''),
        'program_name': row.get('project', ''),
        'program_id': f"DOE{uuid.uuid4().hex[:6]}",
        'link': '',
        'original_row': row,
        'source_file': 'doe'
    }


def extract_identifiers_doi(row):
    """Extract key identifiers from the DOI CSV format."""
    clean_row = {k.strip(): v for k, v in row.items()}
    
    raw_funding = clean_row.get('Total Announced Funding Amount', '')
    if raw_funding == '-' or not raw_funding:
        return None
    
    total_funding = clean_funding_amount(raw_funding)
    if total_funding == 0:
        return None
    
    lat = clean_coordinate(clean_row.get('Latitude'))
    lon = clean_coordinate(clean_row.get('Longitude'))
    
    return {
        'project_name': clean_row.get('Project Title', ''),
        'project_desc': clean_row.get('Program Name', ''), 
        'latitude': lat,
        'longitude': lon,
        'state': normalize_state(clean_row.get('State or US Territory', '')),
        'city': '', 
        'tribe': clean_row.get('Tribe', ''),
        'county': '',  
        'funding_amount': total_funding,
        'funding_source': 'BIL', 
        'agency': 'Department of the Interior',
        'bureau': clean_row.get('Bureau Name', ''),
        'category': map_doi_category(clean_row.get('Program Area', '')),
        'subcategory': clean_row.get('Program Area', ''),
        'program_name': clean_row.get('Program Name', ''),
        'program_id': f"DOI{uuid.uuid4().hex[:6]}",
        'link': clean_row.get('Program Website', ''),
        'original_row': row,
        'source_file': 'doi'
    }


def extract_identifiers_epa(row):
    """Extract key identifiers from the EPA CSV format."""
    funding_source = row.get('Funding Source', '')
    if funding_source:
        if 'IRA' in funding_source:
            funding_source = 'IRA'
        elif 'BIL' in funding_source:
            funding_source = 'BIL'
    
    return {
        'project_name': row.get('Project Title', ''),
        'project_desc': row.get('Project Description', ''),
        'latitude': clean_coordinate(row.get('Latitude')),
        'longitude': clean_coordinate(row.get('Longitude')),
        'state': normalize_state(row.get('State', '')),
        'city': row.get('City', ''),
        'tribe': '',  
        'county': row.get('County', ''),
        'funding_amount': clean_funding_amount(row.get('Award Amount')),
        'funding_source': funding_source,
        'agency': 'Environmental Protection Agency',
        'bureau': '',  
        'category': map_epa_category(row.get('Investment Category', ''), row.get('Program', '')),
        'subcategory': row.get('Program', ''),
        'program_name': row.get('Program', ''),
        'program_id': row.get('Federal Award Identification Number', f"EPA{uuid.uuid4().hex[:6]}"),
        'link': row.get('Website Url', '') or row.get('Announcement Url', ''),
        'original_row': row,
        'source_file': 'epa'
    }


def extract_identifiers_noaa(row):
    """Extract key identifiers from the NOAA CSV format."""
    funding_source = row.get('Funding Statute', '')
    if funding_source:
        if 'IRA' in funding_source:
            funding_source = 'IRA'
        elif 'BIL' in funding_source:
            funding_source = 'BIL'
    
    latitude = clean_coordinate(row.get('POP.lat')) or clean_coordinate(row.get('Recipient.lat'))
    longitude = clean_coordinate(row.get('POP.lng')) or clean_coordinate(row.get('Recipient.long'))
    
    state = row.get('Place of Performance State(s)', '') or row.get('Recipient State', '')
    if ',' in state: 
        state = state.split(',')[0].strip()
    
    return {
        'project_name': row.get('Project Title', ''),
        'project_desc': row.get('Project Description', ''),
        'latitude': latitude,
        'longitude': longitude,
        'state': normalize_state(state),
        'city': '',  
        'tribe': '',  
        'county': '',  
        'funding_amount': clean_funding_amount(row.get('Total Award Amount')),
        'funding_source': funding_source,
        'agency': 'Department of Commerce',
        'bureau': 'National Oceanic and Atmospheric Administration',
        'category': map_noaa_category(row.get('Strategic Plan Goal', ''), row.get('Program Full Title', '')),
        'subcategory': row.get('Program Short Title', ''),
        'program_name': row.get('Program Full Title', ''),
        'program_id': row.get('Award Number (FAIN)', f"NOAA{uuid.uuid4().hex[:6]}"),
        'link': row.get('Program Website', '') or row.get('Project Website', ''),
        'original_row': row,
        'source_file': 'noaa'
    }


def extract_identifiers_usbr(row):
    """Extract key identifiers from the US Bureau of Reclamation CSV format."""
    return {
        'project_name': row.get('ProjectName', ''),
        'project_desc': row.get('ProjectDescription', ''),
        'latitude': clean_coordinate(row.get('Latitude')),
        'longitude': clean_coordinate(row.get('Longitude')),
        'state': normalize_state(row.get('State', '')),
        'city': row.get('City', ''),
        'tribe': row.get('Tribe', ''),
        'county': '',  
        'funding_amount': clean_funding_amount(row.get('Announced')),
        'funding_source': 'IRA',  
        'agency': 'Department of the Interior',
        'bureau': 'Bureau of Reclamation',
        'category': map_usbr_category(row.get('SubsectionTitle', ''), row.get('Subprogram', '')),
        'subcategory': row.get('Subprogram', ''),
        'program_name': f"{row.get('SubsectionTitle', '')} - {row.get('Subprogram', '')}",
        'program_id': row.get('Identifier', f"USBR{uuid.uuid4().hex[:6]}"),
        'link': row.get('PressRelease', ''),
        'original_row': row,
        'source_file': 'usbr'
    }


def map_bia_category(proj_type):
    """Map BIA project types to main file categories."""
    category_map = {
        'Irrigation': 'Water',
        'Power': 'Energy',
        'Dam': 'Water',
        'Safety of Dams': 'Water',
        'Water': 'Water'
    }
    return category_map.get(proj_type, 'Tribal')


def map_doe_category(category, tech):
    """Map DOE categories to main file categories."""
    if 'Manufacturing' in category:
        return 'Clean Energy, Buildings, and Manufacturing'
    
    tech_map = {
        'Hydroelectric': 'Clean Energy, Buildings, and Manufacturing',
        'Solar': 'Clean Energy, Buildings, and Manufacturing',
        'Wind': 'Clean Energy, Buildings, and Manufacturing',
        'Nuclear': 'Clean Energy, Buildings, and Manufacturing',
        'Geothermal': 'Clean Energy, Buildings, and Manufacturing',
        'Battery': 'Clean Energy, Buildings, and Manufacturing'
    }
    
    return tech_map.get(tech, 'Energy')


def map_doi_category(program_area):
    """Map DOI program areas to main file categories."""
    category_map = {
        'Legacy Pollution': 'Legacy Pollution',
        'Ecosystem Restoration': 'Ecosystem Restoration',
        'Water': 'Water',
        'Wildfire': 'Wildland Fire Management',
        'Drought': 'Drought'
    }
    return category_map.get(program_area, 'Other')


def map_epa_category(investment_category, program):
    """Map EPA categories to main file categories."""
    if not investment_category:
        # Try to infer from program
        if any(kw in (program or '').lower() for kw in ['water', 'clean water', 'drinking']):
            return 'Water'
        if any(kw in (program or '').lower() for kw in ['air', 'pollution', 'emissions']):
            return 'Climate and Environment'
        return 'Environmental Protection'
    
    category_map = {
        'Water Infrastructure': 'Water',
        'Clean Water': 'Water',
        'Drinking Water': 'Water',
        'Brownfields': 'Legacy Pollution',
        'Superfund': 'Legacy Pollution',
        'Air Quality': 'Climate and Environment',
        'Climate': 'Climate and Environment',
        'Environmental Justice': 'Climate and Environment'
    }
    
    for key, value in category_map.items():
        if key.lower() in investment_category.lower():
            return value
    
    return 'Environmental Protection'


def map_noaa_category(strategic_goal, program_title):
    """Map NOAA categories to main file categories."""
    if strategic_goal:
        category_map = {
            'Wildfire': 'Wildland Fire Management',
            'Climate': 'Climate and Environment',
            'Fisheries': 'Ecosystem Restoration',
            'Ocean': 'Ecosystem Restoration',
            'Weather': 'Climate and Environment',
            'Multi-Hazard': 'Climate and Environment'
        }
        
        for key, value in category_map.items():
            if key.lower() in strategic_goal.lower():
                return value
    
    if program_title:
        if any(kw in program_title.lower() for kw in ['fish', 'marine', 'habitat', 'coastal']):
            return 'Ecosystem Restoration'
        if any(kw in program_title.lower() for kw in ['climate', 'weather', 'forecast']):
            return 'Climate and Environment'
        if 'wildfire' in program_title.lower():
            return 'Wildland Fire Management'
    
    return 'Climate and Environment' 


def map_usbr_category(subsection, subprogram):
    """Map US Bureau of Reclamation categories to main file categories."""
    if 'Water' in subsection or 'Water' in subprogram:
        return 'Water'
    if 'Drought' in subsection or 'Drought' in subprogram:
        return 'Drought'
    if 'Dam' in subsection or 'Dam' in subprogram:
        return 'Water'
    if 'Ecosystem' in subsection or 'Ecosystem' in subprogram:
        return 'Ecosystem Restoration'
    if 'Rural' in subsection or 'Rural' in subprogram:
        return 'Water'
    
    return 'Water'  

def calculate_distance(lat1, lon1, lat2, lon2):
    """Calculate Haversine distance between two points in kilometers."""
    if not all([lat1, lon1, lat2, lon2]):
        return float('inf')
        
    try:
        lat1, lon1, lat2, lon2 = map(math.radians, [float(lat1), float(lon1), float(lat2), float(lon2)])
        
        # Haversine formula
        dlon = lon2 - lon1
        dlat = lat2 - lat1
        a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
        c = 2 * math.asin(math.sqrt(a))
        r = 6371  # Radius of earth in kilometers
        return c * r
    except (ValueError, TypeError):
        return float('inf')


def normalize_text(text):
    """Normalize text for comparison by removing common words and standardizing."""
    if not text:
        return ''
        
    normalized = text.lower()
    
    common_words = ['project', 'program', 'initiative', 'the', 'and', 'for', 'of', 'to', 'in', 'a', 'an']
    for word in common_words:
        normalized = re.sub(r'\b' + word + r'\b', ' ', normalized)
        
    normalized = re.sub(r'[^\w\s]', ' ', normalized)
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    
    return normalized


def calculate_text_similarity(text1, text2):
    """Calculate similarity score between two text strings."""
    if not text1 or not text2:
        return 0
        
    norm1 = normalize_text(text1)
    norm2 = normalize_text(text2)
    
    if not norm1 or not norm2:
        return 0
        
    if norm1 == norm2:
        return 100
        
    words1 = set(norm1.split())
    words2 = set(norm2.split())
    
    sig_words1 = {w for w in words1 if len(w) > 3}
    sig_words2 = {w for w in words2 if len(w) > 3}
    
    # Calculate Jaccard similarity for significant words
    if sig_words1 and sig_words2:
        intersection = len(sig_words1.intersection(sig_words2))
        union = len(sig_words1.union(sig_words2))
        jaccard = intersection / union if union > 0 else 0
        return jaccard * 100
    
    return 0


def calculate_similarity_score(project1, project2):
    """Calculate similarity score between two projects."""
    score = 0
    reasons = []
    
    # 1. Compare geographic location (40 points max)
    distance = calculate_distance(
        project1['latitude'], project1['longitude'],
        project2['latitude'], project2['longitude']
    )
    
    if distance < 1:
        score += 40
        reasons.append(f"Geographic distance <1km ({distance:.2f}km)")
    elif distance < 10:
        score += 30
        reasons.append(f"Geographic distance <10km ({distance:.2f}km)")
    elif distance < 50:
        score += 15
        reasons.append(f"Geographic distance <50km ({distance:.2f}km)")
    elif distance < 100:
        score += 5
        reasons.append(f"Geographic distance <100km ({distance:.2f}km)")
    
    # 2. Compare state (10 points)
    if project1['state'] and project2['state'] and project1['state'] == project2['state']:
        score += 10
        reasons.append(f"State match: {project1['state']}")
    
    # 3. Compare funding source (5 points)
    if project1['funding_source'] and project2['funding_source'] and \
       project1['funding_source'] == project2['funding_source']:
        score += 5
        reasons.append(f"Funding source match: {project1['funding_source']}")
    
    # 4. Compare project name (30 points max)
    name_similarity = calculate_text_similarity(project1['project_name'], project2['project_name'])
    if name_similarity > 80:
        score += 30
        reasons.append(f"Project name high similarity ({name_similarity:.1f}%)")
    elif name_similarity > 50:
        score += 20
        reasons.append(f"Project name medium similarity ({name_similarity:.1f}%)")
    elif name_similarity > 30:
        score += 10
        reasons.append(f"Project name low similarity ({name_similarity:.1f}%)")
    
    # 5. Compare project descriptions (15 points max)
    desc_similarity = calculate_text_similarity(project1['project_desc'], project2['project_desc'])
    if desc_similarity > 70:
        score += 15
        reasons.append(f"Project description high similarity ({desc_similarity:.1f}%)")
    elif desc_similarity > 40:
        score += 10
        reasons.append(f"Project description medium similarity ({desc_similarity:.1f}%)")
    elif desc_similarity > 20:
        score += 5
        reasons.append(f"Project description low similarity ({desc_similarity:.1f}%)")
    
    # 6. Compare funding amount (within 10% = similar) (max 5 points)
    if project1['funding_amount'] > 0 and project2['funding_amount'] > 0:
        amount_ratio = min(project1['funding_amount'], project2['funding_amount']) / \
                       max(project1['funding_amount'], project2['funding_amount'])
        if amount_ratio > 0.9:
            score += 5
            reasons.append(f"Funding amount similar (ratio: {amount_ratio:.2f})")
    
    # 7. Agency/Bureau match (5 points)
    if project1['agency'] and project2['agency'] and project1['agency'] == project2['agency']:
        score += 5
        reasons.append(f"Agency match: {project1['agency']}")
    
    return {
        'score': score,
        'reasons': reasons,
        'distance_km': distance if distance != float('inf') else None
    }


def create_spatial_index(projects):
    """Create an R-tree spatial index for fast geographic lookups."""
    idx = index.Index()
    for i, project in enumerate(projects):
        if project['latitude'] and project['longitude']:
            # Create a bounding box around the point (~10km radius)
            idx.insert(i, (
                project['longitude'] - 0.1,  # min_x
                project['latitude'] - 0.1,   # min_y
                project['longitude'] + 0.1,  # max_x
                project['latitude'] + 0.1    # max_y
            ))
    return idx

def create_state_index(projects):
    """Create an index of projects by state for fast lookups."""
    state_idx = defaultdict(list)
    for i, project in enumerate(projects):
        if project['state']:
            state_idx[project['state']].append(i)
    return state_idx

def precompute_text_features(projects):
    """Precompute TF-IDF features for project names and descriptions."""
    vectorizer = TfidfVectorizer(
        strip_accents='unicode',
        lowercase=True,
        stop_words='english'
    )
    
    texts = [f"{p['project_name']} {p['project_desc']}" for p in projects]
    return vectorizer, vectorizer.fit_transform(texts)

def find_similar_projects_optimized(new_project, main_projects, spatial_idx, state_idx, 
                                  vectorizer, main_features, threshold=40.0):
    """Optimized version of find_similar_projects using spatial and text indexing."""
    similar_projects = []
    
    # 1. First filter by location (if available)
    candidate_indices = set()
    
    if new_project['latitude'] and new_project['longitude']:
        # Get projects within ~10km
        nearby = spatial_idx.intersection((
            new_project['longitude'] - 0.1,
            new_project['latitude'] - 0.1,
            new_project['longitude'] + 0.1,
            new_project['latitude'] + 0.1
        ))
        candidate_indices.update(nearby)
    
    # 2. Add projects from same state
    if new_project['state']:
        candidate_indices.update(state_idx[new_project['state']])
    
    # 3. If no candidates found, use text similarity to find initial candidates
    if not candidate_indices:
        text = f"{new_project['project_name']} {new_project['project_desc']}"
        new_features = vectorizer.transform([text])
        
        # Get cosine similarity with all projects
        similarities = cosine_similarity(new_features, main_features)[0]
        
        # Get indices of projects with similarity above threshold
        candidate_indices = set(np.where(similarities > threshold/100)[0])
    
    # 4. Calculate detailed similarity only for candidates
    for idx in candidate_indices:
        main_project = main_projects[idx]
        similarity = calculate_similarity_score(new_project, main_project)
        if similarity['score'] >= threshold:
            similar_projects.append({
                'main_project': main_project,
                'similarity': similarity
            })
    
    # Sort by similarity score (highest first)
    similar_projects.sort(key=lambda x: x['similarity']['score'], reverse=True)
    return similar_projects

def process_chunk(chunk, main_projects, spatial_idx, state_idx, vectorizer, main_features, 
                 extract_func, args):
    """Process a chunk of rows in parallel."""
    new_projects = []
    review_projects = []
    
    for row in chunk:
        project = extract_func(row)
        
        if project is None:
            continue
            
        similar_projects = find_similar_projects_optimized(
            project, main_projects, spatial_idx, state_idx,
            vectorizer, main_features, args.review_threshold
        )
        
        if not similar_projects:
            new_projects.append(project)
        elif similar_projects[0]['similarity']['score'] >= args.confidence_threshold:
            continue  
        else:
            review_record = create_review_record(project, similar_projects)
            review_projects.append({
                'project': project,
                'review': review_record
            })
    
    return new_projects, review_projects

def create_review_record(new_project, similar_projects):
    """Create a record for manual review."""
    record = {
        'status': 'needs_review',
        'new_project_name': new_project['project_name'],
        'new_project_desc': new_project['project_desc'],
        'new_latitude': new_project['latitude'],
        'new_longitude': new_project['longitude'],
        'new_state': new_project['state'],
        'new_city': new_project['city'],
        'new_funding': new_project['funding_amount'],
        'new_source': new_project['source_file'],
        'match_count': len(similar_projects),
        'top_match_id': '',
        'top_match_name': '',
        'top_match_score': '',
        'top_match_reasons': '',
        'all_matches': ''
    }
    
    if similar_projects:
        top_match = similar_projects[0]
        record.update({
            'top_match_id': top_match['main_project']['Unique ID'],
            'top_match_name': top_match['main_project']['project_name'],
            'top_match_score': top_match['similarity']['score'],
            'top_match_reasons': '; '.join(top_match['similarity']['reasons']),
            'all_matches': '; '.join([
                f"{m['main_project']['Unique ID']} ({m['similarity']['score']:.1f}%)"
                for m in similar_projects[:5]  
            ])
        })
    
    return record


def clean_link(link):
    """Extract URL from HTML link or return original if no HTML."""
    if not link:
        return ''
    
    href_match = re.search(r'href="([^"]+)"', link)
    if href_match:
        return href_match.group(1)
    
    return link.strip()


def format_for_main_csv(project):
    """Format a project record for the main CSV format."""
    formatted = project.get('original_row', {}).copy()
    
    try:
        lat = float(project.get('latitude', 0))
        lon = float(project.get('longitude', 0))
        if abs(lat) < 0.000001 or abs(lon) < 0.000001:
            return None
        if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
            return None
    except (ValueError, TypeError):
        return None
    
    unique_id = project.get('Unique ID')
    if not unique_id or not (unique_id.startswith('ASST') or unique_id.startswith('CONT')):
        for key, value in project.get('original_row', {}).items():
            if isinstance(value, str) and (value.startswith('ASST') or value.startswith('CONT')):
                unique_id = value
                break
        else:
            unique_id = f"PROJ{uuid.uuid4().hex[:8].upper()}"
        
    data_source = project.get('source_file', '').upper().split('.')[0]
    
    link = clean_link(project.get('link', ''))
    
    updates = {
        'Unique ID': unique_id,
        'Data Source': data_source,
        'Funding Source': project.get('funding_source', ''),
        'Program ID': project.get('program_id', ''),
        'Program Name': project.get('program_name', ''),
        'Project Name': project.get('project_name', ''),
        'Project Description': project.get('project_desc', ''),
        'Project Location Type': project.get('project_location_type', 'Latitude and Longitude'),
        'Latitude': lat,
        'Longitude': lon,
        'City': project.get('city', ''),
        'County': project.get('county', ''),
        'Tribe': project.get('tribe', ''),
        'State': project.get('state', ''),
        '118th CD': project.get('congressional_district', ''),
        'Funding Amount': project.get('funding_amount', ''),
        'Link': link,
        'Agency Name': project.get('agency', ''),
        'Bureau Name': project.get('bureau', ''),
        'Category': project.get('category', ''),
        'Subcategory': project.get('subcategory', ''),
        'Program Type': ''  # Clear Program Type for new rows
    }
    
    formatted.update(updates)
    
    return formatted


def process_file(input_file, main_projects, spatial_idx, state_idx, vectorizer, main_features, args):
    """Process a single input file and identify new/duplicate projects."""
    print(f"Processing file: {input_file}")
    
    try:
        input_data = load_csv(input_file)
    except Exception as e:
        print(f"Error loading {input_file}: {e}")
        return [], []
    
    filename = os.path.basename(input_file).lower()
    
    if 'bia' in filename:
        file_type = 'bia'
        extract_func = extract_identifiers_bia
    elif 'doe' in filename:
        file_type = 'doe'
        extract_func = extract_identifiers_doe
    elif 'doi' in filename:
        file_type = 'doi'
        extract_func = extract_identifiers_doi
    elif 'epa' in filename:
        file_type = 'epa'
        extract_func = extract_identifiers_epa
    elif 'noaa' in filename:
        file_type = 'noaa'
        extract_func = extract_identifiers_noaa
    elif 'usbr' in filename:
        file_type = 'usbr'
        extract_func = extract_identifiers_usbr
    else:
        print(f"Error: Unknown file type for {input_file}")
        print("Filename must contain one of: bia, doe, doi, epa, noaa, usbr")
        return [], []
    
    print(f"Processing {file_type} file format")
    
    new_projects = []
    review_projects = []
    
    total_rows = len(input_data)
    with tqdm(total=total_rows, desc=f"Processing {file_type} file", unit="rows") as pbar:
        for i, row in enumerate(input_data):
            project = extract_func(row)
            project['source_file'] = os.path.basename(input_file)
            
            similar_projects = find_similar_projects_optimized(
                project, main_projects, spatial_idx, state_idx,
                vectorizer, main_features, args.review_threshold
            )
            
            if not similar_projects:
                # No similar projects found - consider it new
                if args.verbose:
                    tqdm.write(f"New project found: {project['project_name']}")
                new_projects.append(project)
            elif similar_projects[0]['similarity']['score'] >= args.confidence_threshold:
                # High confidence match - consider it a duplicate
                if args.verbose:
                    tqdm.write(f"Duplicate found: {project['project_name']} matches " +
                          f"{similar_projects[0]['main_project']['project_name']} " +
                          f"({similar_projects[0]['similarity']['score']:.1f}%)")
            else:
                # Medium confidence - needs review
                if args.verbose:
                    tqdm.write(f"Needs review: {project['project_name']} " +
                          f"(score: {similar_projects[0]['similarity']['score']:.1f}%)")
                review_record = create_review_record(project, similar_projects)
                review_projects.append({
                    'project': project,
                    'review': review_record
                })
            
            pbar.update(1)
            
            if args.verbose and i > 0 and i % 1000 == 0:
                tqdm.write(f"Progress: {i}/{total_rows} rows processed, " +
                      f"{len(new_projects)} new, {len(review_projects)} for review")
    
    print(f"\nCompleted processing {len(input_data)} rows from {input_file}")
    print(f"Found {len(new_projects)} new projects and {len(review_projects)} requiring review")
    
    return new_projects, review_projects


def write_output_files(main_projects, new_projects, review_projects, file_paths, args):
    """Write output files with updated main list and review list."""
    if args.dry_run:
        print(f"Dry run - would add {len(new_projects)} new projects to main file")
        print(f"Dry run - would write {len(review_projects)} projects to review file")
        return
    
    main_fieldnames = list(main_projects[0].keys()) if main_projects else []
    
    if 'Unique ID' not in main_fieldnames:
        main_fieldnames.insert(0, 'Unique ID')
    
    all_projects = []
    
    for project in main_projects:
        if isinstance(project, dict):
            all_projects.append(project)
        else:
            all_projects.append(dict(project))
    
    valid_new_projects = []
    for project in new_projects:
        formatted_project = format_for_main_csv(project)
        if formatted_project is not None:  # Only add projects with valid lat/lon
            # Only keep fields that are in the main schema
            filtered_project = {k: formatted_project.get(k, '') for k in main_fieldnames}
            all_projects.append(filtered_project)
            valid_new_projects.append(project)
    
    skipped_count = len(new_projects) - len(valid_new_projects)
    if skipped_count > 0:
        print(f"Skipped {skipped_count} projects due to invalid lat/lon values")
    
    with open(file_paths['output'], 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=main_fieldnames)
        writer.writeheader()
        writer.writerows(all_projects)
    
    print(f"Updated main file written to {file_paths['output']}")
    print(f"Added {len(valid_new_projects)} new projects (total: {len(all_projects)})")
    
    if review_projects:
        review_fieldnames = review_projects[0]['review'].keys() if review_projects else []
        
        with open(file_paths['review'], 'w', encoding='utf-8', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=review_fieldnames)
            writer.writeheader()
            writer.writerows([p['review'] for p in review_projects])
        
        print(f"Review file written to {file_paths['review']}")
        print(f"{len(review_projects)} projects require manual review")


def main():
    """Main function to process all files and generate output."""
    args = parse_args()
    file_paths = get_file_paths(args)
    
    for path in [file_paths['main']] + file_paths['inputs']:
        if not os.path.isfile(path):
            print(f"Error: File not found - {path}")
            return 1
    
    print(f"\n{'='*80}")
    print(f"IRA/BIL Project Merger")
    print(f"{'='*80}")
    print(f"main file: {file_paths['main']}")
    print(f"Input files: {len(file_paths['inputs'])}")
    for i, input_file in enumerate(file_paths['inputs']):
        print(f"  {i+1}. {os.path.basename(input_file)}")
    print(f"Output file: {file_paths['output']}")
    print(f"Review file: {file_paths['review']}")
    print(f"{'='*80}\n")
    
    print(f"Loading main file: {file_paths['main']}")
    main_data = load_csv(file_paths['main'])
    
    print(f"Extracting data from main file...")
    with tqdm(total=len(main_data), desc="Processing main file", unit="rows") as pbar:
        main_projects = []
        for row in main_data:
            main_projects.append(extract_identifiers_main(row))
            pbar.update(1)
    
    print(f"Loaded {len(main_projects)} projects from main file")
    
    print("Creating spatial index...")
    spatial_idx = create_spatial_index(main_projects)
    
    print("Creating state index...")
    state_idx = create_state_index(main_projects)
    
    print("Computing text features...")
    vectorizer, main_features = precompute_text_features(main_projects)
    
    all_new_projects = []
    all_review_projects = []
    file_summaries = []
    
    with tqdm(total=len(file_paths['inputs']), desc="Processing files", unit="file") as file_pbar:
        for input_file in file_paths['inputs']:
            try:
                input_data = load_csv(input_file)
            except Exception as e:
                print(f"Error loading {input_file}: {e}")
                continue
                
            filename = os.path.basename(input_file).lower()
            
            if 'bia' in filename:
                extract_func = extract_identifiers_bia
            elif 'doe' in filename:
                extract_func = extract_identifiers_doe
            elif 'doi' in filename:
                extract_func = extract_identifiers_doi
            elif 'epa' in filename:
                extract_func = extract_identifiers_epa
            elif 'noaa' in filename:
                extract_func = extract_identifiers_noaa
            elif 'usbr' in filename:
                extract_func = extract_identifiers_usbr
            else:
                print(f"Error: Unknown file type for {input_file}")
                print("Filename must contain one of: bia, doe, doi, epa, noaa, usbr")
                continue
            
            print(f"\nProcessing {filename}...")
            
            chunks = [input_data[i:i + CHUNK_SIZE] for i in range(0, len(input_data), CHUNK_SIZE)]
            
            new_projects = []
            review_projects = []
            
            with ProcessPoolExecutor(max_workers=NUM_PROCESSES) as executor:
                futures = []
                for chunk in chunks:
                    future = executor.submit(
                        process_chunk,
                        chunk,
                        main_projects,
                        spatial_idx,
                        state_idx,
                        vectorizer,
                        main_features,
                        extract_func,
                        args
                    )
                    futures.append(future)
                
                for future in tqdm(futures, desc=f"Processing {len(input_data)} rows", unit="chunk"):
                    chunk_new, chunk_review = future.result()
                    new_projects.extend(chunk_new)
                    review_projects.extend(chunk_review)
            
            file_summaries.append({
                'file': os.path.basename(input_file),
                'new': len(new_projects),
                'review': len(review_projects)
            })
            
            all_new_projects.extend(new_projects)
            all_review_projects.extend(review_projects)
            file_pbar.update(1)
    
    print(f"\n{'='*80}")
    print(f"RESULTS SUMMARY")
    print(f"{'='*80}")
    print(f"{'File':<30} {'New Projects':<15} {'Needs Review':<15}")
    print(f"{'-'*30} {'-'*15} {'-'*15}")
    
    for summary in file_summaries:
        print(f"{summary['file']:<30} {summary['new']:<15} {summary['review']:<15}")
    
    print(f"{'-'*30} {'-'*15} {'-'*15}")
    print(f"{'TOTAL':<30} {len(all_new_projects):<15} {len(all_review_projects):<15}")
    print(f"{'='*80}")
    
    write_output_files(main_data, all_new_projects, all_review_projects, file_paths, args)
    
    if not args.dry_run:
        print(f"\nFinal statistics:")
        print(f"  - Original main projects: {len(main_data)}")
        print(f"  - New projects added: {len(all_new_projects)}")
        print(f"  - Final main project count: {len(main_data) + len(all_new_projects)}")
        print(f"  - Projects requiring manual review: {len(all_review_projects)}")
        print(f"\nOutput files:")
        print(f"  - Updated main: {file_paths['output']}")
        print(f"  - Review file: {file_paths['review']}")
    
    return 0


if __name__ == "__main__":
    exit(main())