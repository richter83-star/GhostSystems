import sys
import os
import json
import logging
import requests
import time

# --- Configuration ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
PRINTFUL_API_URL = "https://api.printful.com"
PRINTFUL_API_KEY = os.environ.get("PRINTFUL_API_KEY")

# This maps your generic product types from Nexus to specific Printful variant IDs.
# We're starting simple. You can find more IDs by browsing Printful's catalog/API.
# 7710 = 11oz White Glossy Mug
# 4017 = Gildan 64000 T-Shirt, White, Size L
VARIANT_MAP = {
    "Mug": 7710,
    "T-Shirt": 4017, 
}

# --- Robust API Request Function ---
def post_to_printful(url, headers, payload, retries=3, delay=5):
    """
    Makes a POST request to the Printful API with exponential backoff.
    """
    for i in range(retries):
        try:
            response = requests.post(url, headers=headers, data=json.dumps(payload))
            # Raise an exception for bad status codes (4xx or 5xx)
            response.raise_for_status()
            logging.info(f"API call successful (Attempt {i+1}/{retries}).")
            return response.json()
        except requests.exceptions.RequestException as e:
            logging.warning(f"API call failed (Attempt {i+1}/{retries}): {e}")
            if i < retries - 1:
                time.sleep(delay)
                delay *= 2 # Exponential backoff
            else:
                logging.error("Max retries exceeded.")
                raise

# --- Main Execution ---
def main():
    logging.info("Starting product generation script for Printful...")

    # 1. Check for API Key
    if not PRINTFUL_API_KEY:
        logging.error("PRINTFUL_API_KEY environment variable not set. Exiting.")
        sys.exit(1)
        
    logging.info("Printful API key found.")

    # 2. Get Job Data from command line argument
    try:
        job_data_json = sys.argv[1]
        job_data = json.loads(job_data_json)
        logging.info("Successfully parsed job data.")
    except IndexError:
        logging.error("No job data provided. Exiting.")
        sys.exit(1)
    except json.JSONDecodeError:
        logging.error(f"Failed to decode JSON: {job_data_json}")
        sys.exit(1)

    # 3. Extract Job Details
    try:
        title = job_data.get("title") or job_data.get("prompt") # Use prompt as fallback title
        description = job_data.get("description", "")
        image_url = job_data["imageUrl"]
        price = job_data["price"]
        product_type = job_data["productType"]
    except KeyError as e:
        logging.error(f"Job data is missing required key: {e}. Payload: {job_data}")
        sys.exit(1)

    # 4. Find Printful Variant ID
    variant_id = VARIANT_MAP.get(product_type)
    if not variant_id:
        logging.error(f"Unknown productType: '{product_type}'. No Printful variant ID found in map. Exiting.")
        sys.exit(1)
        
    logging.info(f"Mapping productType '{product_type}' to Printful variant_id {variant_id}.")

    # 5. Construct Printful API Payload
    headers = {
        "Authorization": f"Bearer {PRINTFUL_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "sync_product": {
            "name": title,
            "thumbnail": image_url # Use our generated image as the main product thumbnail
        },
        "sync_variants": [
            {
                "retail_price": price,
                "variant_id": variant_id,
                "files": [
                    {
                        "type": "default",  # 'default' places it on the main print area (e.g., front of shirt, side of mug)
                        "url": image_url,
                        "options": [],
                        "position": {} # Use default positioning
                    }
                ]
            }
        ]
    }

    # 6. Send to Printful
    api_url = f"{PRINTFUL_API_URL}/store/products"
    
    try:
        logging.info(f"Sending product '{title}' to Printful API...")
        result = post_to_printful(api_url, headers, payload)
        
        product_id = result.get("result", {}).get("id")
        product_name = result.get("result", {}).get("name")
        
        logging.info(f"--- SUCCESS ---")
        logging.info(f"Successfully created Printful product ID: {product_id}, Name: {product_name}")
        logging.info("Printful will now sync this product to your Shopify store.")
        logging.info("Product generation complete.")

    except Exception as e:
        logging.error(f"--- FAILURE ---")
        logging.error(f"Failed to create Printful product: {e}")
        if hasattr(e, 'response') and e.response is not None:
            logging.error(f"API Response: {e.response.text}")
        sys.exit(1)

if __name__ == "__main__":
    main()
