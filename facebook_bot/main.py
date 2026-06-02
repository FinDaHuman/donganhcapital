import logging
import sys
import random
from news_scraper import fetch_latest_news, scrape_article_content
from llm_generator import generate_facebook_post
from facebook_api import post_to_facebook

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

def run_bot():
    logger.info("Starting Facebook Automation Bot...")
    
    # Randomly select a post type. You can adjust the weights/probabilities.
    # 50% News, 25% Promotion, 25% Education
    post_types = ["news", "news", "promotion", "education"]
    post_type = random.choice(post_types)
    
    logger.info(f"Selected post type for this run: {post_type.upper()}")
    
    action_data = {"type": post_type}
    link_to_attach = None
    
    if post_type == "news":
        # 1. Fetch News
        articles = fetch_latest_news(max_articles=1)
        if not articles:
            logger.warning("No articles fetched. Falling back to promotion post.")
            action_data["type"] = "promotion"
            link_to_attach = "https://donganhcapital.com"
        else:
            article = articles[0]
            logger.info(f"Selected article: {article['title']}")
            
            # 2. Scrape detailed content
            content = scrape_article_content(article['link'])
            if content:
                article['content'] = content
                logger.info("Successfully scraped article content.")
            else:
                logger.info("Using RSS description as content fallback.")
                
            action_data["article"] = article
            link_to_attach = article['link']
    
    if action_data["type"] in ["promotion", "education"]:
        # Attach the website link so Facebook displays the OG preview image
        link_to_attach = "https://donganhcapital.com"
        
    # 3. Generate Post via LLM
    logger.info("Generating post content via LLM...")
    post_text = generate_facebook_post(action_data)
    
    if not post_text:
        logger.error("Failed to generate post content. Exiting.")
        return
        
    logger.info("Generated Post Content:\n" + "-"*40 + f"\n{post_text}\n" + "-"*40)
    
    # 4. Post to Facebook with link attached
    logger.info(f"Publishing to Facebook with link: {link_to_attach}")
    success = post_to_facebook(post_text, link=link_to_attach)
    
    if success:
        logger.info("Bot execution completed successfully.")
    else:
        logger.error("Bot execution failed during publishing.")

if __name__ == "__main__":
    run_bot()
