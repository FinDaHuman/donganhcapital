from google import genai
import os
import logging
import random
import re
import time
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

# Vietnam timezone (UTC+7).
VN_TZ = timezone(timedelta(hours=7))

# Limited-time free 1-week Pro trial. Mirrors the frontend cutoff in
# LandingSections.jsx (`2026-07-08T00:00:00+07:00`). After this instant the trial
# CTA is no longer injected into prompts, so posts never advertise a dead offer.
PRO_TRIAL_DEADLINE = datetime(2026, 7, 8, tzinfo=VN_TZ)


def trial_offer_active():
    """True while the limited-time free Pro trial is still being offered."""
    return datetime.now(VN_TZ) < PRO_TRIAL_DEADLINE


def _trial_hint():
    """A one-line, opt-in trial mention — only while the offer is live."""
    if trial_offer_active():
        return (
            "\nƯU ĐÃI ĐANG DIỄN RA (có thể nhắc khéo nếu phù hợp, KHÔNG bắt buộc): "
            "Dùng thử gói Pro MIỄN PHÍ 1 tuần, không cần thẻ."
        )
    return ""

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
    trial_hint = _trial_hint()
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
        1. Mở bài bằng một HOOK mạnh ở dòng đầu tiên (xem mục MARKETING trong QUY TẮC).
        2. Tóm tắt ngắn gọn, trung thực nội dung bài báo (chỉ dựa trên nội dung được cung cấp).
        3. Đưa ra góc nhìn/nhận định khách quan về việc tin tức này ảnh hưởng thế nào đến
           thị trường chứng khoán Việt Nam. Kèm khuyến nghị rủi ro khi phù hợp.
        4. Liên hệ khéo léo tới việc nhà đầu tư có thể theo dõi diễn biến này qua dashboard
           và tín hiệu AI của DongAnh Capital (chỉ dùng dữ kiện trong PRODUCT FACTS).
        5. Chèn đúng 1 CTA trỏ về https://donganhcapital.com (theo mục CALL-TO-ACTION).{trial_hint}
        6. BẮT BUỘC để lại trích dẫn nguồn ở cuối bài: Nguồn: {domain} - {article.get('link')}

        QUY TẮC:
        {system_rules}
        """
        
    elif post_type == "promotion":
        topics = [
            "Giới thiệu nền tảng: dashboard thị trường thời gian thực + tín hiệu AI hằng ngày "
            "(giá vào lệnh, chốt lời, cắt lỗ, điểm tin cậy) cho 226 cổ phiếu Việt Nam — bắt đầu "
            "miễn phí với gói Free trọn đời.",
            "3 mô hình AI độc lập (LightGBM & XGBoost) đối chiếu chéo tín hiệu mỗi phiên: vì sao "
            "sự đồng thuận đa mô hình giúp nhà đầu tư cá nhân ra quyết định tự tin hơn.",
            "AI Agent sắp ra mắt: trợ lý AI đọc tin tức, học phong cách đầu tư của bạn, gợi ý lệnh "
            "cá nhân hóa và chỉ thực thi khi bạn xác nhận — tương lai của đầu tư tại Việt Nam.",
            "So sánh 3 gói Free / Pro / Premium của DongAnh Capital: nhà đầu tư nên bắt đầu từ đâu "
            "và khi nào thì nên nâng cấp.",
            "Phân tích tin tức bằng AI kết hợp chatbot tư vấn đầu tư: công nghệ giúp nhà đầu tư cá "
            "nhân tiết kiệm thời gian nghiên cứu và bám sát thị trường mỗi ngày.",
        ]
        topic = random.choice(topics)

        prompt = f"""
        Bạn là kênh truyền thông chính thức của DongAnh Capital — nền tảng phân tích chứng khoán
        và tín hiệu AI cho nhà đầu tư cá nhân Việt Nam (KHÔNG phải quỹ đầu tư).
        Hãy viết một bài đăng Facebook (khoảng 150-220 từ) quảng bá nền tảng.

        CHỦ ĐỀ HÔM NAY: {topic}

        YÊU CẦU:
        1. Mở bài bằng một HOOK mạnh ở dòng đầu. Giọng văn thu hút, chuyên nghiệp nhưng gần gũi,
           không xưng "tôi".
        2. CHỈ dùng thông tin sản phẩm trong PRODUCT FACTS của QUY TẮC. Tuyệt đối không bịa tính
           năng, số liệu hay con số lợi nhuận. Nếu nói tới AI Agent, ghi rõ là "sắp ra mắt".
        3. Dùng emoji tiết chế và gạch đầu dòng cho dễ đọc.
        4. Chèn đúng 1 CTA trỏ về https://donganhcapital.com (theo mục CALL-TO-ACTION).{trial_hint}
        5. Kết thúc bằng 3-6 hashtag phù hợp.

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
        Bạn là tiếng nói chuyên môn về phân tích kỹ thuật của DongAnh Capital.
        Hãy viết một bài chia sẻ kiến thức ngắn (khoảng 180-280 từ) cho cộng đồng nhà đầu tư trên Facebook.

        KIẾN THỨC HÔM NAY: {concept}

        YÊU CẦU:
        1. Mở bài bằng một HOOK gợi tò mò ở dòng đầu. Giải thích khái niệm chuyên sâu nhưng cực kỳ
           dễ hiểu bằng ví dụ thực tế trên thị trường chứng khoán Việt Nam (VD: VNIndex, cổ phiếu
           ngân hàng, chứng khoán...). Không xưng "tôi".
        2. Cấu trúc mạch lạc: Nêu vấn đề -> Giải thích/Phân tích -> Bài học rút ra.
        3. Liên hệ khéo léo tới việc nhà đầu tư có thể dùng tín hiệu AI và bộ phân tích của
           DongAnh Capital để lọc cơ hội và bám sát kỷ luật giao dịch (chỉ dùng dữ kiện trong
           PRODUCT FACTS; không mô tả tính năng chưa có như đã có sẵn).
        4. Dùng gạch đầu dòng và emoji tiết chế cho trực quan, dễ đọc.
        5. Chèn đúng 1 CTA trỏ về https://donganhcapital.com (theo mục CALL-TO-ACTION).{trial_hint}
        6. Kết thúc bằng 3-6 hashtag phù hợp.

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
