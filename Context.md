# Facebook Automation Plan for DongAnhCapital

## 1. Overview
A completely free, automated system to post content to the DongAnhCapital Facebook page. 
The system will run on a schedule to post:
- Advertisements for the DongAnhCapital website.
- Educational posts on stock trading strategies.
- Summaries of recent Vietnam stock market news.
- Analysis of how recent news impacts the VN stock market.

## 2. Architecture & Tech Stack
- **Hosting / Execution:** GitHub Actions (Scheduled CRON jobs). Completely free, utilizing the existing repository infrastructure.
- **Content Generation:** Free LLM API (e.g., Google Gemini Free Tier) to generate dynamic, engaging Vietnamese content based on raw data.
- **Data Sources:** 
  - RSS Feeds (e.g., CafeF, Vietstock, VnEconomy) to fetch the latest headlines.
  - Web scraping (using `BeautifulSoup` or similar) to extract article content for the LLM to analyze.
- **Publishing:** Facebook Graph API.

## 3. Workflow / Pipeline
1. **Data Ingestion:**
   - Script fetches the latest news from RSS feeds.
   - Selects top relevant articles and scrapes their content.
2. **Content Generation (LLM):**
   - The script will read the strict constraints from `rule.md` and inject them as a system prompt to the LLM.
   - The script sends the scraped news to the Free LLM API with a prompt to:
     - Summarize the news.
     - Provide insights on how it impacts the Vietnamese stock market.
     - Add a promotional tagline for the DongAnhCapital website.
     - **CRITICAL:** Always explicitly cite the source of the news (as enforced by `rule.md`) to avoid copyright violations.
   - For educational or promotional posts, the LLM is prompted with a trading topic or ad template to generate a short, engaging post, strictly following `rule.md`.
3. **Publishing:**
   - The generated content is formatted and sent to the Facebook Page using the Facebook Graph API via a POST request to `/{page_id}/feed`.

## 4. Immediate Next Steps (To-Do)
Since you do not currently have the Facebook API set up, this is the critical first step.

1. **Set up Facebook Developer Account & Token:**
   - Create a Facebook Developer App.
   - Configure permissions (`pages_manage_posts`, `pages_read_engagement`).
   - Generate a Long-Lived Page Access Token and a Page ID.
   - Save these as GitHub Secrets (`FB_PAGE_TOKEN`, `FB_PAGE_ID`).
2. **Set up LLM API Key:**
   - Obtain a free API key (e.g., Google Gemini AI) and add it to GitHub Secrets (`GEMINI_API_KEY`).
3. **Develop the Python Scripts:**
   - Implement the scraping, LLM generation, and Facebook posting logic.
4. **Create GitHub Actions Workflow:**
   - Add `.github/workflows/facebook-bot.yml` with a cron schedule to automate the process daily.
