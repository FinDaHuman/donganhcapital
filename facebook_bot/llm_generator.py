import google.generativeai as genai
import os
import logging

logger = logging.getLogger(__name__)

def load_system_rules():
    """Loads the content generation rules from rule.md"""
    # Look for rule.md in the parent directory of facebook_bot
    rule_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "rule.md")
    try:
        with open(rule_path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        logger.error(f"Failed to load rule.md: {e}")
        return "Always write in Vietnamese. Provide a professional summary."

def generate_facebook_post(article_data):
    """
    Generates a Facebook post using Gemini based on article data.
    article_data expects a dictionary with 'title', 'link', and optionally 'content'.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        logger.error("GEMINI_API_KEY environment variable not set.")
        return None

    genai.configure(api_key=api_key)
    
    # Use gemini-1.5-flash for free tier general text tasks
    model = genai.GenerativeModel('gemini-1.5-flash')
    
    system_rules = load_system_rules()
    
    # Extract source name from URL for citation
    domain = article_data.get("link", "").split("/")[2] if "//" in article_data.get("link", "") else "Nguồn nội bộ"
    
    prompt = f"""
    Bạn là một chuyên gia phân tích chứng khoán làm việc cho DongAnh Capital.
    Nhiệm vụ của bạn là đọc thông tin bài báo dưới đây và viết một bài đăng Facebook hấp dẫn.
    
    TÀI LIỆU BÀI BÁO:
    Tiêu đề: {article_data.get('title')}
    Nội dung: {article_data.get('content', article_data.get('description', 'Không có nội dung chi tiết'))}
    Link: {article_data.get('link')}
    
    YÊU CẦU:
    1. Tóm tắt ngắn gọn nội dung bài báo.
    2. Đưa ra góc nhìn/nhận định về việc tin tức này ảnh hưởng thế nào đến thị trường chứng khoán Việt Nam.
    3. Tuân thủ TUYỆT ĐỐI các quy tắc hệ thống sau đây:
    
    {system_rules}
    
    LƯU Ý QUAN TRỌNG: Bạn BẮT BUỘC phải để lại trích dẫn nguồn ở cuối bài theo định dạng:
    Nguồn: {domain} - {article_data.get('link')}
    """

    try:
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        logger.error(f"Error generating content with Gemini: {e}")
        return None
