import requests
import pandas as pd
import sys
from datetime import datetime

def fetch_arcgis_data(service_url):
    # Ensure URL ends with query
    if not service_url.endswith('query'):
        service_url = service_url + '/query'
    
    params = {
        'where': '1=1',
        'outFields': '*', 
        'returnGeometry': 'false',
        'f': 'json'
    }
    
    try:
        response = requests.get(service_url, params=params)
        response.raise_for_status()
        
        data = response.json()
        
        if 'features' not in data:
            print("Error: No features found in response")
            return None
            
        features = [feature['attributes'] for feature in data['features']]
        
        df = pd.DataFrame(features)
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_file = f'arcgis_data_{timestamp}.csv'
        
        df.to_csv(output_file, index=False)
        print(f"Data successfully saved to {output_file}")
        
        return df
        
    except requests.exceptions.RequestException as e:
        print(f"Error fetching data: {e}")
        return None
    except ValueError as e:
        print(f"Error parsing JSON response: {e}")
        return None
    except Exception as e:
        print(f"Unexpected error: {e}")
        return None

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python fetch-arcgis.py <service_url>")
        sys.exit(1)
        
    service_url = sys.argv[1]
    fetch_arcgis_data(service_url)