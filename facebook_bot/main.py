import logging
import sys
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
    
    # 1. Fetch News
    articles = fetch_latest_news(max_articles=1)
    if not articles:
        logger.warning("No articles fetched. Exiting.")
        return
        
    article = articles[0]
    logger.info(f"Selected article: {article['title']}")
    
    # 2. Scrape detailed content (optional, fall back to description if fails)
    content = scrape_article_content(article['link'])
    if content:
        article['content'] = content
        logger.info("Successfully scraped article content.")
    else:
        logger.info("Using RSS description as content fallback.")
        
    # 3. Generate Post via LLM
    logger.info("Generating post content via LLM...")
    post_text = generate_facebook_post(article)
    
    if not post_text:
        logger.error("Failed to generate post content. Exiting.")
        return
        
    logger.info("Generated Post Content:\n" + "-"*40 + f"\n{post_text}\n" + "-"*40)
    
    # 4. Post to Facebook
    logger.info("Publishing to Facebook...")
    success = post_to_facebook(post_text)
    
    if success:
        logger.info("Bot execution completed successfully.")
    else:
        logger.error("Bot execution failed during publishing.")

if __name__ == "__main__":
    run_bot()
