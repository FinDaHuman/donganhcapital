from google import genai
import os
import logging
import random

logger = logging.getLogger(__name__)

def load_system_rules():
    """Loads the content generation rules from rule.md"""
    rule_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "rule.md")
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
            "Giới thiệu nền tảng tín hiệu giao dịch AI miễn phí của DongAnh Capital (độ trễ bằng 0, quét 400+ mã).",
            "Công nghệ 6 mô hình AI độc quyền giúp phát hiện Breakout cổ phiếu như thế nào?",
            "Tại sao nhà đầu tư cá nhân nên dùng Bot AI để theo dõi thị trường 24/7 thay vì làm thủ công?"
        ]
        topic = random.choice(topics)
        
        prompt = f"""
        Bạn là hệ thống truyền thông chính thức của quỹ giao dịch DongAnh Capital.
        Hãy viết một bài đăng Facebook (khoảng 150-250 từ) để quảng bá về nền tảng của chúng tôi.
        
        CHỦ ĐỀ HÔM NAY: {topic}
        
        YÊU CẦU:
        1. Giọng văn thu hút, chuyên nghiệp nhưng vẫn gần gũi với nhà đầu tư cá nhân. Không xưng "tôi".
        2. Nhấn mạnh việc nền tảng hoàn toàn MIỄN PHÍ.
        3. Thêm các emoji phù hợp.
        4. BẮT BUỘC chèn Call-to-action (CTA) trỏ về link website: https://dong-anh-capital.vercel.app
        
        QUY TẮC:
        {system_rules}
        """
        
    elif post_type == "education":
        concepts = [
            "Quản trị rủi ro: Tại sao phải luôn đặt Stop Loss (Cắt lỗ)?",
            "Mô hình giá Breakout: Dấu hiệu nhận biết dòng tiền lớn tham gia.",
            "Tâm lý giao dịch: Cách tránh FOMA (Sợ lỡ cơ hội) trong những phiên tăng nóng.",
            "Tại sao khối lượng giao dịch (Volume) lại quan trọng khi phân tích cổ phiếu?"
        ]
        concept = random.choice(concepts)
        
        prompt = f"""
        Bạn là hệ thống đào tạo và phân tích kỹ thuật của DongAnh Capital.
        Hãy viết một bài chia sẻ kiến thức ngắn (khoảng 200-300 từ) cho cộng đồng nhà đầu tư trên Facebook.
        
        KIẾN THỨC HÔM NAY: {concept}
        
        YÊU CẦU:
        1. Giải thích khái niệm dễ hiểu, lấy ví dụ thực tế liên quan đến thị trường chứng khoán VN (nếu có thể). Không xưng "tôi".
        2. Dùng bullet points và emoji để bài viết rõ ràng, dễ đọc.
        3. BẮT BUỘC chèn Call-to-action (CTA) trỏ về website: https://dong-anh-capital.vercel.app ở cuối bài, mời họ xem thêm các tín hiệu AI.
        
        QUY TẮC:
        {system_rules}
        """
    else:
        logger.error("Unknown post type.")
        return None

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
        return response.text
    except Exception as e:
        logger.error(f"Error generating content with Gemini: {e}")
        return None
