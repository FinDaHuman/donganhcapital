import feedparser
import requests
from bs4 import BeautifulSoup
import logging
import random

logger = logging.getLogger(__name__)

# List of RSS feeds for Vietnam financial news
RSS_FEEDS = [
    "https://cafef.vn/rss/thi-truong-chung-khoan.rss",
    "https://vietstock.vn/rss/chung-khoan.rss"
]

def fetch_latest_news(max_articles=3):
    """
    Fetches the latest news articles from predefined RSS feeds.
    Returns a list of dictionaries containing title, link, and a brief description.
    """
    articles = []
    
    # Shuffle feeds to get variety over time
    feeds_to_fetch = RSS_FEEDS.copy()
    random.shuffle(feeds_to_fetch)
    
    for feed_url in feeds_to_fetch:
        logger.info(f"Fetching RSS feed: {feed_url}")
        try:
            feed = feedparser.parse(feed_url)
            for entry in feed.entries[:max_articles]:
                articles.append({
                    "title": entry.title,
                    "link": entry.link,
                    "description": entry.get("description", "")
                })
        except Exception as e:
            logger.error(f"Error fetching {feed_url}: {e}")
            
    # Shuffle the combined articles and pick a random subset to summarize
    if articles:
        random.shuffle(articles)
        return articles[:max_articles]
    
    return []

def scrape_article_content(url):
    """
    Attempts to scrape the main text content of an article given its URL.
    This is a basic implementation; specific sites might need tailored logic.
    """
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Very basic heuristic: find all paragraphs and combine them
        paragraphs = soup.find_all('p')
        content = " ".join([p.get_text().strip() for p in paragraphs if len(p.get_text().strip()) > 20])
        
        # Limit content length to avoid overwhelming the LLM
        return content[:3000] 
        
    except Exception as e:
        logger.error(f"Error scraping {url}: {e}")
        return ""
