from google import genai
import os
import logging
import random
import re
import time

logger = logging.getLogger(__name__)

def clean_markdown(text):
    """Robustly strips markdown formatting characters to ensure clean Facebook display."""
    if not text:
        return text
    # Remove bold markers
    text = text.replace('**', '')
    # Remove header hashes ONLY if followed by a space (protects #hashtags)
    text = re.sub(r'^#+\s+', '', text, flags=re.MULTILINE)
    # Remove horizontal rules
    text = re.sub(r'^\s*[-*_]{3,}\s*$', '', text, flags=re.MULTILINE)
    # Clean up multiple consecutive newlines
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def load_system_rules():
    """Loads the content generation rules from rule.md"""
    rule_path = os.path.join(os.path.dirname(__file__), "rule.md")
    try:
        with open(rule_path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        logger.error(f"Failed to load rule.md: {e}")
        return "Always write in Vietnamese. Provide a professional summary."

def generate_facebook_post(action_data):
    """
    Generates a Facebook post using Gemini based on the action_data.
    action_data requires a 'type' ("news", "promotion", "education").
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        logger.error("GEMINI_API_KEY environment variable not set.")
        return None

    client = genai.Client(api_key=api_key)
    
    system_rules = load_system_rules()
    post_type = action_data.get("type")
    prompt = ""
    
    if post_type == "news":
        article = action_data.get("article", {})
        domain = article.get("link", "").split("/")[2] if "//" in article.get("link", "") else "Nguồn nội bộ"
        
        prompt = f"""
        Bạn là hệ thống AI phân tích chứng khoán của DongAnh Capital.
        Hãy đọc thông tin bài báo dưới đây và viết một bài đăng Facebook hấp dẫn đại diện cho thương hiệu.
        
        TÀI LIỆU BÀI BÁO:
        Tiêu đề: {article.get('title')}
        Nội dung: {article.get('content', article.get('description', 'Không có nội dung chi tiết'))}
        Link: {article.get('link')}
        
        YÊU CẦU:
        1. Tóm tắt ngắn gọn nội dung bài báo.
        2. Đưa ra góc nhìn/nhận định về việc tin tức này ảnh hưởng thế nào đến thị trường chứng khoán Việt Nam.
        3. Tuân thủ các quy tắc hệ thống.
        4. BẮT BUỘC để lại trích dẫn nguồn ở cuối bài: Nguồn: {domain} - {article.get('link')}
        
        QUY TẮC:
        {system_rules}
        """
        
    elif post_type == "promotion":
        topics = [
            "Giới thiệu nền tảng tín hiệu giao dịch AI của DongAnh Capital: Miễn phí sử dụng Mô hình dự đoán Breakout công khai (Public Model) với độ trễ bằng 0.",
            "Khám phá hệ thống AI của chúng tôi: 1 Mô hình Public dự đoán cổ phiếu hoàn toàn miễn phí và 2 Mô hình Pro chuyên sâu dành cho gói trả phí.",
            "Tại sao nhà đầu tư cá nhân nên dùng Bot AI để theo dõi thị trường 24/7? Trải nghiệm ngay Mô hình Public miễn phí của DongAnh Capital."
        ]
        topic = random.choice(topics)
        
        prompt = f"""
        Bạn là hệ thống truyền thông chính thức của quỹ giao dịch DongAnh Capital.
        Hãy viết một bài đăng Facebook (khoảng 150-250 từ) để quảng bá về nền tảng của chúng tôi.
        
        CHỦ ĐỀ HÔM NAY: {topic}
        
        YÊU CẦU:
        1. Giọng văn thu hút, chuyên nghiệp nhưng vẫn gần gũi với nhà đầu tư cá nhân. Không xưng "tôi".
        2. Đảm bảo thông tin chính xác về hệ thống AI: Chúng tôi có 1 Mô hình Public miễn phí (chuyên dự đoán/lọc cổ phiếu Breakout) và 2 Mô hình Pro chuyên sâu dành cho hội viên trả phí.
        3. Thêm các emoji phù hợp.
        4. BẮT BUỘC chèn Call-to-action (CTA) trỏ về link website: https://donganhcapital.com
        
        QUY TẮC:
        {system_rules}
        """
        
    elif post_type == "education":
        concepts = [
            "Quản trị rủi ro: Tại sao phải luôn đặt Stop Loss (Cắt lỗ)? Nguyên tắc kỷ luật giúp bảo vệ vốn.",
            "Mô hình giá Breakout: Dấu hiệu nhận biết dòng tiền lớn tham gia và cách AI hỗ trợ phát hiện sớm.",
            "Tâm lý giao dịch: Cách tránh FOMO trong những phiên tăng nóng và quản lý cảm xúc khi thị trường giảm.",
            "Phân tích khối lượng (Volume) kết hợp với hành động giá (Price Action): Bí quyết tìm điểm mua an toàn.",
            "Sự khác biệt giữa Đầu tư dài hạn (Phân tích cơ bản) và Giao dịch ngắn hạn (Phân tích kỹ thuật) trong chứng khoán VN."
        ]
        concept = random.choice(concepts)
        
        prompt = f"""
        Bạn là chuyên gia phân tích kỹ thuật và đào tạo của DongAnh Capital.
        Hãy viết một bài chia sẻ kiến thức ngắn (khoảng 200-300 từ) cho cộng đồng nhà đầu tư trên Facebook.
        
        KIẾN THỨC HÔM NAY: {concept}
        
        YÊU CẦU:
        1. Giải thích khái niệm chuyên sâu nhưng cực kỳ dễ hiểu bằng ví dụ thực tế trên thị trường chứng khoán Việt Nam (VD: VNIndex, cổ phiếu ngân hàng, chứng khoán...). Không xưng "tôi".
        2. Cấu trúc bài viết mạch lạc: Nêu vấn đề -> Giải thích/Phân tích -> Bài học rút ra.
        3. Liên hệ khéo léo: Nhắc đến việc nhà đầu tư có thể sử dụng các Mô hình AI (như Mô hình Public miễn phí của DongAnh Capital) để tự động hóa việc lọc tín hiệu, giảm bớt khó khăn trong phân tích thủ công.
        4. Dùng bullet points và emoji để bài viết trực quan, dễ đọc.
        5. BẮT BUỘC chèn Call-to-action (CTA) trỏ về website: https://donganhcapital.com ở cuối bài.
        
        QUY TẮC:
        {system_rules}
        """
    else:
        logger.error("Unknown post type.")
        return None

    # We prioritize the fast model, then fall back to the pro model if unavailable.
    models_to_try = [
    "gemini-3.5-flash",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-3.1-flash-lite"
]
    
    max_retries = 3
    retry_delay_503 = 30  # 30 seconds

    for model_name in models_to_try:
        for attempt in range(max_retries):
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                )
                return clean_markdown(response.text)
            except Exception as e:
                error_msg = str(e)
                # 1. Handle 503/500/502/504 (Service Unavailable / Server Errors) -> Retry the same model
                if "503" in error_msg or "UNAVAILABLE" in error_msg or "500" in error_msg or "502" in error_msg or "504" in error_msg:
                    if attempt < max_retries - 1:
                        logger.warning(f"Model {model_name} server error (503/50x). Attempt {attempt + 1}/{max_retries} failed. Retrying in {retry_delay_503}s...")
                        time.sleep(retry_delay_503)
                        continue  # Retry the same model
                    else:
                        logger.error(f"Model {model_name} failed after {max_retries} attempts due to server errors.")
                        break  # Give up on this model, try the next one
                
                # 2. Handle 429 (Too Many Requests / Quota Exceeded) -> Skip the model immediately
                elif "429" in error_msg or "ResourceExhausted" in error_msg:
                    logger.warning(f"Model {model_name} quota exceeded (429). Skipping to next model...")
                    break  # Skip to the next model
                
                # 3. Handle other errors (400, 401, 403, 404, etc.) -> Skip the model immediately
                else:
                    logger.error(f"Error generating content with {model_name}: {e}. Skipping to next model...")
                    break  # Skip to the next model

    logger.error("All fallback models failed.")
    return None
