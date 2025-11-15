import sys
import os
import json
import logging
import requests
import time
import shopify
import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1.base_query import FieldFilter
import threading
# from flask import Flask # <-- REMOVED

# --- Configuration ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logging.info("--- GHOST LISTENER (Level 3.1) STARTING ---")

# --- Firebase Admin Initialization ---
try:
    # Render's "Secret File" path
    # Make sure you named your secret file 'firebase_service_account.json' in Render
    SERVICE_ACCOUNT_FILE = 'firebase_service_account.json' 
    if not os.path.exists(SERVICE_ACCOUNT_FILE):
        logging.warning("Service account file not found at 'firebase_service_account.json'.")
        # Check if running in Render's older secret file path
        alt_path = '/etc/secrets/firebase_service_account.json'
        if os.path.exists(alt_path):
            logging.info("Found service account file at alternative path.")
            SERVICE_ACCOUNT_FILE = alt_path
        else:
            raise FileNotFoundError("Service account file not found in any known location.")

    cred = credentials.Certificate(SERVICE_ACCOUNT_FILE)
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    logging.info("Firebase Admin SDK initialized successfully.")
except Exception as e:
    logging.critical(f"Failed to initialize Firebase Admin: {e}")
    logging.critical("Ensure 'firebase_service_account.json' is added as a Secret File in Render.")
    sys.exit(1)

# --- Printful Config ---
PRINTFUL_API_URL = "https://api.printful.com"
PRINTFUL_API_KEY = os.environ.get("PRINTFUL_API_KEY")
VARIANT_MAP = {
    "Mug": 7710,    # 11oz White Glossy Mug
    "T-Shirt": 4017, # Gildan 64000 T-Shirt, White, L
}

# --- Shopify Config ---
SHOPIFY_STORE_URL = os.environ.get("SHOPIFY_STORE_URL")
SHOPIFY_API_KEY = os.environ.get("SHOPIFY_API_KEY")
SHOPIFY_API_PASSWORD = os.environ.get("SHOPIFY_API_PASSWORD")
SHOPIFY_API_VERSION = "2024-04"

# ==============================================================================
# HELPER FUNCTION: PRINTFUL API POST
# ==============================================================================
def post_to_printful(url, headers, payload, retries=3, delay=5):
    """Makes a POST request to the Printful API with exponential backoff."""
    for i in range(retries):
        try:
            response = requests.post(url, headers=headers, data=json.dumps(payload))
            response.raise_for_status()
            logging.info(f"Printful API call successful (Attempt {i+1}/{retries}).")
            return response.json()
        except requests.exceptions.RequestException as e:
            logging.warning(f"Printful API call failed (Attempt {i+1}/{retries}): {e}")
            if i < retries - 1:
                time.sleep(delay)
                delay *= 2
            else:
                logging.error("Max retries exceeded for Printful API.")
                raise

# ==============================================================================
# GHOST WORKER 1: CREATE PRINTFUL PRODUCT
# ==============================================================================
def create_printful_product(job_doc):
    """Ghost worker for creating Print-on-Demand products via Printful."""
    job_data = job_doc.to_dict()
    title = job_data.get("title", "Untitled")
    product_type = job_data.get("productType")

    logging.info(f"--- ROUTE: PRINTFUL ---")
    logging.info(f"Initializing Printful Ghost for product: {title}")

    # 1. Check for Printful API Key
    if not PRINTFUL_API_KEY:
        logging.error("PRINTFUL_API_KEY environment variable not set. Cannot proceed.")
        return False

    # 2. Get Job Details (Image is required for Printful)
    try:
        # NOTE: Printful requires an image. We will add a check for this.
        image_url = job_data.get("imageUrl")
        if not image_url:
             logging.error(f"Job data {job_doc.id} is missing 'imageUrl'. Printful products require an image.")
             return False
        price = job_data["price"]
        auto_publish = job_data.get("autoPublish", False)
    except KeyError as e:
        logging.error(f"Job data {job_doc.id} is missing required key: {e}.")
        return False

    # 3. Find Printful Variant ID
    variant_id = VARIANT_MAP.get(product_type)
    if not variant_id:
        logging.error(f"Unknown productType: '{product_type}'. No Printful variant ID found in map.")
        return False
        
    logging.info(f"Mapping productType '{product_type}' to Printful variant_id {variant_id}.")
    
    # 4. Construct Printful API Payload
    headers = {
        "Authorization": f"Bearer {PRINTFUL_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "sync_product": {"name": title, "thumbnail": image_url},
        "sync_variants": [{
            "retail_price": price,
            "variant_id": variant_id,
            "files": [{"type": "default", "url": image_url, "options": [], "position": {}}]
        }]
    }
    
    # Add auto-publish flag
    payload["publish"] = auto_publish
    logging.info(f"Auto-Publish set to: {auto_publish}")

    # 5. Send to Printful
    api_url = f"{PRINTFUL_API_URL}/store/products"
    try:
        logging.info(f"Sending product '{title}' to Printful API...")
        result = post_to_printful(api_url, headers, payload)
        product_id = result.get("result", {}).get("id")
        product_name = result.get("result", {}).get("name")
        logging.info(f"Successfully created Printful product ID: {product_id}, Name: {product_name}")
        logging.info("Printful will now sync this product to your Shopify store.")
        return True
    except Exception as e:
        logging.error(f"Failed to create Printful product: {e}")
        if hasattr(e, 'response') and e.response is not None:
            logging.error(f"API Response: {e.response.text}")
        return False

# ==============================================================================
# GHOST WORKER 2: CREATE DIGITAL PRODUCT
# ==============================================================================
def create_digital_product(job_doc):
    """Ghost worker for creating a digital product directly in Shopify."""
    job_data = job_doc.to_dict()
    title = job_data.get("title", "Untitled")
    product_type = job_data.get("productType")

    logging.info(f"--- ROUTE: DIGITAL PRODUCT ---")
    logging.info(f"Initializing Shopify Ghost for product: {title}")

    # 1. Check for Shopify credentials
    if not all([SHOPIFY_STORE_URL, SHOPIFY_API_KEY, SHOPIFY_API_PASSWORD]):
        logging.error("Shopify environment variables not set. Cannot create digital product.")
        return False

    # 2. Get Job Details
    try:
        description = job_data.get("description", "")
        price = job_data["price"]
        auto_publish = job_data.get("autoPublish", False)
    except KeyError as e:
        logging.error(f"Job data {job_doc.id} is missing required key: {e}.")
        return False

    try:
        # 3. Activate Shopify API session
        shop_url = f"https://{SHOPIFY_API_KEY}:{SHOPIFY_API_PASSWORD}@{SHOPIFY_STORE_URL}/admin/api/{SHOPIFY_API_VERSION}"
        shopify.Shop.set_site(shop_url)
        
        # 4. Create a new Product object
        new_product = shopify.Product()
        new_product.title = title
        new_product.body_html = description
        new_product.product_type = "AI Prompt Package"
        new_product.vendor = "NexusAI"
        
        # 5. Set price and mark as digital (no shipping)
        new_product.variants = [
            shopify.Variant({
                'price': price,
                'requires_shipping': False,
                'taxable': False 
            })
        ]
        
        # 6. Set publish status
        new_produc_status = "active" if auto_publish else "draft"
        new_product.status = new_produc_status
        status_string = "published (active)" if auto_publish else "draft"
        
        # 7. Save the product to Shopify
        if new_product.save():
            logging.info(f"Successfully created Shopify product ID: {new_product.id}")
            logging.info(f"Product was saved as {status_string} in your Shopify store.")
            
            # 8. (Optional) Add image to digital product if one was provided
            if job_data.get("imageUrl"):
                logging.info("Image URL found, adding to digital product...")
                new_product.images = [
                    {'src': job_data.get("imageUrl")}
                ]
                new_product.save()
            return True
        else:
            logging.error(f"Failed to save Shopify product: {new_product.errors.full_messages()}")
            return False

    except Exception as e:
        logging.error(f"Error connecting to Shopify or creating product: {e}")
        return False

# ==============================================================================
# MAIN EXECUTION: JOB ROUTER
# ==============================================================================
def process_job(job_doc):
    """
    This function is called by the listener every time a new job is received.
    It routes the job to the correct worker.
    """
    job_id = job_doc.id
    job_data = job_doc.to_dict()
    product_type = job_data.get("productType")

    logging.info(f"--- JOB RECEIVED: {job_id} ---")
    logging.info(f"Routing job for product type: '{product_type}'")

    # Update job status to "processing"
    job_ref = job_doc.reference
    try:
        job_ref.update({"status": "processing"})
    except Exception as e:
        logging.error(f"Failed to update job status to processing for {job_id}: {e}")
        # Don't stop, proceed to process anyway

    # --- JOB ROUTING LOGIC ---
    success = False
    try:
        if product_type in ("T-Shirt", "Mug"):
            success = create_printful_product(job_doc)
            
        elif product_type == "AI Prompt Package":
            success = create_digital_product(job_doc)
            
        elif product_type == "Tech Gadget":
            logging.warning(f"Product type '{product_type}' is not yet supported. Job will be marked as 'failed'.")
            success = False # Mark as failed so it can be reviewed
            
        else:
            logging.error(f"Unknown productType: '{product_type}'. No route found for this job.")
            success = False

    except Exception as e:
        logging.error(f"--- UNHANDLED EXCEPTION processing job {job_id}: {e} ---")
        success = False
    
    # 4. Final log and status update
    if success:
        logging.info(f"--- JOB {job_id} FINISHED: SUCCESS ---")
        job_ref.update({"status": "complete"})
    else:
        logging.error(f"--- JOB {job_id} FINISHED: FAILED ---")
        job_ref.update({"status": "failed"})

# ==============================================================================
# FIRESTORE LISTENER (THREAD)
# ==============================================================================
# This function will run in a background thread
def start_listener():
    logging.info("Initializing Firestore listener in background thread...")
    
    # We listen to *all* jobs from *all* users with status "pending"
    # This requires a Composite Index in Firebase. The log will tell you the URL to create it.
    try:
        jobs_query = db.collection_group('jobs').where(filter=FieldFilter('status', '==', 'pending'))

        # The on_snapshot function will be called in a background thread
        # We use a simple callback_done to ensure we don't block
        callback_done = threading.Event()

        def on_snapshot(col_snapshot, changes, read_time):
            logging.info(f"Snapshot received. {len(changes)} change(s) detected.")
            for change in changes:
                if change.type.name == 'ADDED':
                    logging.info(f"New pending job detected: {change.document.id}")
                    # Run the job processing in a new thread so we don't block the listener
                    job_thread = threading.Thread(target=process_job, args=(change.document,))
                    job_thread.start()
            callback_done.set() # Signal that the snapshot is processed

        # Start the listener
        query_watch = jobs_query.on_snapshot(on_snapshot)
        logging.info("📡 Ghost listener is online and watching for 'pending' jobs.")
        
        # Keep the main thread alive
        while True:
            time.sleep(60) # Keep the process alive
            
    except Exception as e:
        logging.critical(f"Listener query failed: {e}")
        logging.critical("This likely requires a new Firebase Composite Index.")
        logging.critical("Please check the error log for a URL to create the index.")
        # We don't exit(1) here, as the main thread is the Flask app
        sys.exit(1) # We can exit now, background worker will restart

# ==============================================================================
# FLASK WEB SERVER (MAIN THREAD)
# ==============================================================================
# This is what Render will see as the "Web Service"
# app = Flask(__name__) <-- REMOVED

# @app.route('/') <-- REMOVED
# def hello_world(): <-- REMOVED
    # This provides a simple health check page
#    logging.info("Health check endpoint '/' was pinged.") <-- REMOVED
#    return 'Ghost Listener is active and listening to Firebase in the background.', 200 <-- REMOVED

def main():
    # Start the Firestore listener in a separate, non-daemon thread
    listener_thread = threading.Thread(target=start_listener, name="FirestoreListener")
    listener_thread.start()
    
    # Keep the main thread alive so the listener thread can run
    listener_thread.join()

if __name__ == "__main__":
    main()
