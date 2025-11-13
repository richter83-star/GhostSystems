import sys
import os
import shopify

def main():
    # 1. Get job details from listener (passed as arguments)
    topic = sys.argv[1] if len(sys.argv) > 1 else "Untitled Product"
    niche = sys.argv[2] if len(sys.argv) > 2 else "General"
    
    print(f"[Python] Received job. Topic: {topic}, Niche: {niche}")

    # 2. Get Shopify credentials from Render Environment Variables
    store_url_raw = os.environ.get('SHOPIFY_STORE_URL')
    api_key = os.environ.get('SHOPIFY_API_KEY')
    access_token = os.environ.get('SHOPIFY_ACCESS_TOKEN')

    if not all([store_url_raw, api_key, access_token]):
        print("Error: Shopify environment variables are not set.")
        print("Please set SHOPIFY_STORE_URL, SHOPIFY_API_KEY, and SHOPIFY_ACCESS_TOKEN in Render.")
        sys.exit(1)

    try:
        # --- NEW URL CLEANUP ---
        # Remove https:// and trailing slashes to prevent connection errors
        clean_store_url = store_url_raw.replace("https://", "").replace("http://", "").rstrip('/')
        print(f"[Python] Connecting to cleaned URL: {clean_store_url}")
        # --- END NEW URL CLEANUP ---

        # 3. Connect to the Shopify store
        shop_url = f"https://{api_key}:{access_token}@{clean_store_url}/admin"
        shopify.ShopifyResource.set_site(shop_url)
        
        # 4. Create the new product as a DRAFT
        print(f"Creating draft product: {topic}...")
        
        new_product = shopify.Product()
        new_product.title = topic
        new_product.vendor = "GhostNexus Automation"
        new_product.product_type = niche
        new_product.tags = [niche, "GhostGenerated"]
        new_product.body_html = f"<strong>Automated product generation for:</strong> {topic}"
        
        # Set to draft status so it doesn't go live
        new_product.published = False 
        
        # Save the product
        new_product.save()

        if new_product.id:
            print(f"Success! Created draft product ID: {new_product.id} - {new_product.title}")
            # (In the future, we will also attach the generated image here)
            print(f"View draft: https://{clean_store_url}/admin/products/{new_product.id}")
        else:
            print("Error: Product save failed. Check Shopify permissions.")
            sys.exit(1) # Exit with an error code if save fails

    except Exception as e:
        print(f"Error connecting to Shopify or creating product: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
