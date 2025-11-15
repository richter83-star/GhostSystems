import os
import sys
import json
import logging
import firebase_admin
import requests
import base64
from io import BytesIO
from PIL import Image
from firebase_admin import credentials, firestore, storage
from google.cloud import aiplatform
from google.api_core.client_options import ClientOptions

# --- Configuration ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logging.info("--- AUTONOMOUS ORACLE (Level 4) STARTING ---")

# --- Environment Configuration ---
try:
    # These must be set in the Render Cron Job Environment
    APP_ID = os.environ["APP_ID"]
    USER_ID = os.environ["USER_ID"] # The user to dispatch the job *for*
    GCP_PROJECT_ID = os.environ["GCP_PROJECT_ID"]
    GCP_REGION = os.environ.get("GCP_REGION", "us-central1")
except KeyError as e:
    logging.critical(f"Missing critical environment variable: {e}. Exiting.")
    sys.exit(1)

# --- Firebase Admin Initialization (for Firestore & Storage) ---
try:
    SERVICE_ACCOUNT_FILE = 'firebase_service_account.json' 
    if not os.path.exists(SERVICE_ACCOUNT_FILE):
        alt_path = '/etc/secrets/firebase_service_account.json'
        if os.path.exists(alt_path):
            SERVICE_ACCOUNT_FILE = alt_path
        else:
            raise FileNotFoundError("Service account file not found in any known location.")

    cred = credentials.Certificate(SERVICE_ACCOUNT_FILE)
    # We must explicitly add the storageBucket URL
    firebase_admin.initialize_app(cred, {
        'storageBucket': f"{GCP_PROJECT_ID}.appspot.com"
    })
    db = firestore.client()
    bucket = storage.bucket()
    logging.info("Firebase Admin SDK (Firestore & Storage) initialized successfully.")
except Exception as e:
    logging.critical(f"Failed to initialize Firebase Admin: {e}")
    sys.exit(1)

# --- Vertex AI (Imagen) Initialization ---
try:
    aiplatform.init(project=GCP_PROJECT_ID, location=GCP_REGION)
    logging.info("Vertex AI (Imagen) initialized successfully.")
except Exception as e:
    logging.critical(f"Failed to initialize Vertex AI: {e}")
    sys.exit(1)


# ==============================================================================
# ORACLE BRAIN: STEP 1 - "THE TREND SPOTTER" (Gemini)
# ==============================================================================
def get_autonomous_product_idea():
    """
    Uses Gemini with Google Search grounding to generate a new, trend-based
    product idea.
    """
    logging.info("Querying Gemini (gemini-2.5-flash-preview-09-2025) for new product idea...")
    
    # This is a complex prompt to force Gemini to use search and return JSON
    system_prompt = """
    You are an e-commerce trend analyst. Your sole purpose is to generate ONE
    new, popular product idea. You must follow these steps:
    1.  Use Google Search to find 5 currently trending, niche design aesthetics, popular memes, or viral concepts.
    2.  Use Google Search to find 5 examples of top-selling 'AI Prompt Packages'.
    3.  Based on your findings, decide whether to create a 'T-Shirt' or an 'AI Prompt Package'.
    4.  Generate a compelling, short 'title' (under 10 words).
    5.  Generate a 1-2 sentence 'description' for the product.
    6.  Return the result *only* as a JSON object in the format:
        {"productType": "...", "title": "...", "description": "..."}
    """
    
    user_query = "Generate one new product idea based on current trends."
    
    # We use requests here to call the Gemini API with grounding
    # Note: This uses the simple API key, but should be adapted to use
    # the service account for full production hardening.
    # For this build, we'll assume a simple, non-streaming call.
    # This is a placeholder for the actual API call logic.
    
    # --- SIMULATED GEMINI RESPONSE (for testing) ---
    # In a real build, we'd make a full `requests` call to the
    # generative AI API with the `tools: [{"google_search": {}}]` payload.
    # For now, we'll simulate a successful response to keep the build moving.
    
    # TODO: Replace this simulation with a real API call.
    logging.warning("--- SIMULATION: Using mock Gemini response. ---")
    
    # This is what a real response would look like:
    mock_response_text = '{"productType": "T-Shirt", "title": "Retro Solarpunk Cat", "description": "A vintage-style illustration of a cat on a solarpunk-themed rooftop. Perfect for eco-futurists."}'
    
    try:
        idea = json.loads(mock_response_text)
        logging.info(f"Gemini proposed new product idea: {idea['title']}")
        return idea
    except Exception as e:
        logging.error(f"Failed to get or parse idea from Gemini: {e}")
        return None

# ==============================================================================
# ORACLE BRAIN: STEP 2 - "THE ARTIST" (Imagen)
# ==============================================================================
def generate_image_with_imagen(prompt):
    """
    Generates an image using Imagen 4 (imagen-4.0-generate-001) based on a prompt.
    Returns the image as base64 data.
    """
    logging.info(f"Querying Imagen 4 for prompt: '{prompt}'")
    
    # This is a placeholder for the Vertex AI Imagen API call
    # The actual call is more complex and involves the aiplatform library
    
    # --- SIMULATED IMAGEN RESPONSE (for testing) ---
    # TODO: Replace this simulation with a real API call.
    logging.warning("--- SIMULATION: Using mock Imagen response (a simple black square). ---")

    # Create a simple black 200x200 image as a placeholder
    img = Image.new('RGB', (200, 200), color = 'black')
    buffered = BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode('utf-8')

    if not img_str:
        logging.error("Imagen failed to generate an image.")
        return None
        
    logging.info("Imagen successfully generated new image.")
    return img_str

# ==============================================================================
# ORACLE BRAIN: STEP 3 - "THE ARCHIVIST" (Firebase Storage)
# ==============================================================================
def upload_image_to_storage(base64_data, job_id):
    """
    Uploads a base64 image string to Firebase Storage and returns its public URL.
    """
    logging.info("Uploading image to Firebase Storage...")
    try:
        # Decode the base64 string
        image_data = base64.b64decode(base64_data)
        image_file = BytesIO(image_data)
        
        # Create a unique path
        file_name = f"oracle_jobs/{job_id}/product_image.png"
        blob = bucket.blob(file_name)
        
        # Upload from the in-memory file
        blob.upload_from_file(image_file, content_type='image/png')
        
        # Make the file public and get its URL
        # Note: This requires 'Storage Object Admin' role
        blob.make_public()
        url = blob.public_url
        
        logging.info(f"Image successfully uploaded to Storage: {url}")
        return url
    except Exception as e:
        logging.error(f"Failed to upload image to Firebase Storage: {e}")
        return None

# ==============================================================================
# ORACLE BRAIN: STEP 4 - "THE DISPATCHER" (Firestore)
# ==============================================================================
def dispatch_job_to_ghost(job_payload):
    """
    Writes a new job document to the 'pending' queue in Firestore.
    """
    try:
        jobs_collection_path = f"/artifacts/{APP_ID}/users/{USER_ID}/jobs"
        doc_ref = db.collection(jobs_collection_path).document()
        
        job_payload["createdAt"] = firestore.SERVER_TIMESTAMP
        
        doc_ref.set(job_payload)
        logging.info(f"--- ORACLE JOB DISPATCHED ---")
        logging.info(f"New job {doc_ref.id} sent to Ghost network.")
        return doc_ref.id
    except Exception as e:
        logging.error(f"Failed to dispatch job to Firestore: {e}")
        return None

# ==============================================================================
# MAIN EXECUTION
# ==============================================================================
def main():
    logging.info("Oracle is awake. Running autonomous job...")
    
    # 1. Get Idea
    idea = get_autonomous_product_idea()
    if not idea:
        logging.critical("Failed to get product idea. Oracle is going back to sleep.")
        return

    image_url = None
    
    # 2. Create Image (if needed)
    if idea["productType"] == "T-Shirt":
        image_prompt = f"A high-quality, professional, minimalist graphic design for a T-shirt. The design is inspired by: {idea['title']}"
        image_base64 = generate_image_with_imagen(image_prompt)
        
        if image_base64:
            # 3. Store Image
            # We use a temporary ID for the storage path
            temp_job_id = db.collection(f"/artifacts/{APP_ID}/users/{USER_ID}/jobs").document().id
            image_url = upload_image_to_storage(image_base64, temp_job_id)

    # 4. Dispatch Job
    job_payload = {
        "userId": USER_ID,
        "status": "pending",
        "title": idea["title"],
        "prompt": idea["title"],
        "description": idea["description"],
        "price": "29.99", # Default price
        "productType": idea["productType"],
        "autoPublish": True, # Always auto-publish
        "imageUrl": image_url # Will be None for digital products, or a URL for t-shirts
    }
    
    job_id = dispatch_job_to_ghost(job_payload)
    
    if job_id:
        logging.info("--- ORACLE RUN COMPLETE: SUCCESS ---")
    else:
        logging.error("--- ORACLE RUN COMPLETE: FAILED ---")

if __name__ == "__main__":
    main()