import pandas as pd
import numpy as np
from pathlib import Path
import os

def get_project_root():
    """Get the absolute path to the project root directory."""
    script_dir = Path(os.path.abspath(__file__)).parent  # scripts/src
    return script_dir.parent.parent  # project root

def load_and_prepare_data():
    print('Loading files...')
    root_dir = get_project_root()
    raw_dir = root_dir / 'scripts' / 'data' / 'raw'
    
    projects_df = pd.read_csv(raw_dir / 'wh-public-projects-updated.csv', low_memory=False)
    assistance_df = pd.read_csv(raw_dir / 'usaspending-assistance.csv', low_memory=False)
    contracts_df = pd.read_csv(raw_dir / 'usaspending-contracts.csv', low_memory=False)
    
    assistance_df = assistance_df.rename(columns={
        'assistance_award_unique_key': 'Unique ID',
        'outlayed_amount_from_IIJA_supplemental': 'Outlayed Amount From IIJA Supplemental',
        'obligated_amount_from_IIJA_supplemental': 'Obligated Amount From IIJA Supplemental'
    })
    
    contracts_df = contracts_df.rename(columns={
        'contract_award_unique_key': 'Unique ID',
        'outlayed_amount_from_IIJA_supplemental': 'Outlayed Amount From IIJA Supplemental',
        'obligated_amount_from_IIJA_supplemental': 'Obligated Amount From IIJA Supplemental'
    })
    
    return projects_df, assistance_df, contracts_df

def merge_data(projects_df, assistance_df, contracts_df):
    asst_mask = projects_df['Data Source'].eq('USAspending') & projects_df['Unique ID'].str.startswith('ASST', na=False)
    cont_mask = projects_df['Data Source'].eq('USAspending') & projects_df['Unique ID'].str.startswith('CONT', na=False)
    
    print(f'Found {asst_mask.sum():,} assistance records and {cont_mask.sum():,} contract records from USAspending')
    
    asst_merged = pd.merge(
        projects_df[asst_mask],
        assistance_df[['Unique ID', 'Outlayed Amount From IIJA Supplemental', 
                      'Obligated Amount From IIJA Supplemental']],
        on='Unique ID',
        how='left'
    )
    
    cont_merged = pd.merge(
        projects_df[cont_mask],
        contracts_df[['Unique ID', 'Outlayed Amount From IIJA Supplemental', 
                     'Obligated Amount From IIJA Supplemental']],
        on='Unique ID',
        how='left'
    )
    
    final_df = pd.concat([
        projects_df[~(asst_mask | cont_mask)],
        asst_merged,
        cont_merged
    ]).sort_index()
    
    return final_df

def calculate_percentages(df):
    outlayed = df['Outlayed Amount From IIJA Supplemental']
    obligated = df['Obligated Amount From IIJA Supplemental']
    
    na_both_mask = outlayed.isna() & obligated.isna()
    na_outlayed_mask = outlayed.isna() & obligated.notna()
    zero_outlayed_mask = (outlayed == 0) & obligated.notna()
    normal_calc_mask = outlayed.notna() & obligated.notna() & (obligated != 0)
    
    df['Percent IIJA Outlayed'] = pd.NA
    df.loc[na_both_mask, 'Percent IIJA Outlayed'] = pd.NA
    df.loc[na_outlayed_mask, 'Percent IIJA Outlayed'] = 0
    df.loc[zero_outlayed_mask, 'Percent IIJA Outlayed'] = 0
    df.loc[normal_calc_mask, 'Percent IIJA Outlayed'] = (
        outlayed[normal_calc_mask] / obligated[normal_calc_mask] * 100).round(2)
    
    return df

def main():
    projects_df, assistance_df, contracts_df = load_and_prepare_data()
    merged_df = merge_data(projects_df, assistance_df, contracts_df)
    final_df = calculate_percentages(merged_df)
    final_df = final_df.rename(columns={'Unique ID': 'UID'})
    
    # Save to raw directory
    raw_dir = get_project_root() / 'scripts' / 'data' / 'raw'
    final_df.to_csv(raw_dir / 'projects.csv', index=False)
    print('Done.')

if __name__ == "__main__":
    main()