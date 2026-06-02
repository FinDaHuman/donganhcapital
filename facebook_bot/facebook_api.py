import os
import requests
import logging

logger = logging.getLogger(__name__)

def post_to_facebook(message, link=None):
    """
    Posts a given message text to the configured Facebook Page.
    If 'link' is provided, Facebook will automatically fetch the image (thumbnail)
    and display it along with the post.
    """
    page_id = os.environ.get("FB_PAGE_ID")
    page_token = os.environ.get("FB_PAGE_TOKEN")
    
    if not page_id or not page_token:
        logger.error("Missing FB_PAGE_ID or FB_PAGE_TOKEN environment variables.")
        return False
        
    url = f"https://graph.facebook.com/v19.0/{page_id}/feed"
    
    payload = {
        "message": message,
        "access_token": page_token
    }
    
    # Adding a link will force Facebook to display a preview card with an image
    if link:
        payload["link"] = link
    
    try:
        response = requests.post(url, data=payload)
        response.raise_for_status()
        logger.info(f"Successfully posted to Facebook. Post ID: {response.json().get('id')}")
        return True
    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to post to Facebook: {e}")
        if e.response is not None:
            logger.error(f"Response content: {e.response.text}")
        return False
