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
            "\n        ƯU ĐÃI ĐANG DIỄN RA (có thể gộp vào dòng CTA nếu phù hợp, KHÔNG bắt buộc, "
            "KHÔNG thêm dòng riêng): Dùng thử gói Pro MIỄN PHÍ 1 tuần, không cần thẻ."
        )
    return ""


# ── Length enforcement ──
# Facebook engagement drops off a cliff on long posts, so the body (everything
# except the CTA link line, the source line, and the hashtag line) is hard-capped
# at 2 sentences / ~280 chars. The prompt asks for it, and this validator enforces
# it: too-long output gets one rewrite attempt, then the run is aborted rather
# than publishing a wall of text.
BODY_MAX_SENTENCES = 2
BODY_MAX_CHARS = 300  # small buffer over the ~280-char target in rule.md


def _post_body(text):
    """The post minus its tail: CTA/link line, 'Nguồn:' line, hashtag-only lines."""
    body_lines = []
    for line in text.splitlines():
        s = line.strip()
        if not s:
            continue
        if "donganhcapital.com" in s.lower():
            continue
        if s.lower().startswith("nguồn:") or s.lower().startswith("nguon:"):
            continue
        tokens = s.split()
        if tokens and all(t.startswith("#") for t in tokens):
            continue
        body_lines.append(s)
    return " ".join(body_lines)


def _count_sentences(body):
    # Strip thousand/decimal separators inside numbers (e.g. "1.300 điểm") so they
    # don't register as sentence breaks.
    cleaned = re.sub(r"(?<=\d)[.,](?=\d)", "", body)
    parts = re.split(r"[.!?…]+", cleaned)
    return len([p for p in parts if p.strip()])


def validate_post_length(text):
    """True when the body respects the 1-2 sentence / ~280 char cap."""
    body = _post_body(text)
    return _count_sentences(body) <= BODY_MAX_SENTENCES and len(body) <= BODY_MAX_CHARS

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
        Đọc bài báo dưới đây và viết một bài đăng Facebook SIÊU NGẮN, giật tít,
        khiến người đang lướt newsfeed phải dừng lại.

        TÀI LIỆU BÀI BÁO:
        Tiêu đề: {article.get('title')}
        Nội dung: {article.get('content', article.get('description', 'Không có nội dung chi tiết'))}
        Link: {article.get('link')}

        ĐỊNH DẠNG ĐẦU RA BẮT BUỘC (không thêm bất kỳ phần nào khác):
        [THÂN BÀI: TỐI ĐA 1-2 câu, tổng cộng dưới 280 ký tự — tóm gọn tin đắt giá nhất
        kèm góc nhìn/tác động tới thị trường chứng khoán Việt Nam. Phải có chi tiết cụ
        thể (con số, mã cổ phiếu, sự kiện) lấy từ bài báo. Có thể mở đầu bằng 1 emoji.]

        [CTA: đúng 1 dòng chứa link https://donganhcapital.com — theo mục CALL-TO-ACTION.]
        Nguồn: {domain} - {article.get('link')}
        [2-3 hashtag trên 1 dòng]

        YÊU CẦU:
        - Thân bài TUYỆT ĐỐI không quá 2 câu. Không phân tích dài, không gạch đầu dòng.
        - Chỉ dựa trên nội dung bài báo được cung cấp — không bịa số liệu hay tình tiết.{trial_hint}

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
        Hãy viết một bài đăng Facebook SIÊU NGẮN quảng bá nền tảng — một câu "đắt" hơn
        mười câu nhạt.

        CHỦ ĐỀ HÔM NAY: {topic}

        ĐỊNH DẠNG ĐẦU RA BẮT BUỘC (không thêm bất kỳ phần nào khác):
        [THÂN BÀI: TỐI ĐA 1-2 câu, tổng cộng dưới 280 ký tự — một hook mạnh nêu đúng
        lợi ích/nỗi đau của nhà đầu tư cá nhân, gắn với chủ đề hôm nay. Có thể mở đầu
        bằng 1 emoji.]

        [CTA: đúng 1 dòng chứa link https://donganhcapital.com — theo mục CALL-TO-ACTION.]
        [2-3 hashtag trên 1 dòng]

        YÊU CẦU:
        - Thân bài TUYỆT ĐỐI không quá 2 câu. Không liệt kê tính năng, không gạch đầu dòng.
        - CHỈ dùng thông tin trong PRODUCT FACTS của QUY TẮC — không bịa tính năng, số liệu
          hay lợi nhuận. Nếu nói tới AI Agent, ghi rõ là "sắp ra mắt".
        - Không xưng "tôi".{trial_hint}

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
        Hãy chia sẻ MỘT insight kiến thức đầu tư SIÊU NGẮN cho cộng đồng nhà đầu tư trên
        Facebook — kiểu mẹo/quy tắc đắt giá khiến người đọc muốn lưu lại, không phải bài giảng.

        KIẾN THỨC HÔM NAY: {concept}

        ĐỊNH DẠNG ĐẦU RA BẮT BUỘC (không thêm bất kỳ phần nào khác):
        [THÂN BÀI: TỐI ĐA 1-2 câu, tổng cộng dưới 280 ký tự — chưng cất kiến thức trên
        thành một insight sắc bén, gợi tò mò, dễ hiểu với nhà đầu tư cá nhân Việt Nam.
        Có thể mở đầu bằng 1 emoji.]

        [CTA: đúng 1 dòng chứa link https://donganhcapital.com — theo mục CALL-TO-ACTION.]
        [2-3 hashtag trên 1 dòng]

        YÊU CẦU:
        - Thân bài TUYỆT ĐỐI không quá 2 câu. Không giải thích dài, không gạch đầu dòng.
        - Không xưng "tôi". Chỉ dùng dữ kiện trong PRODUCT FACTS khi nhắc tới sản phẩm;
          không mô tả tính năng chưa có như đã có sẵn.{trial_hint}

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
                post_text = clean_markdown(response.text)
                if validate_post_length(post_text):
                    return post_text

                # One corrective rewrite, then give up: never publish a wall of text.
                logger.warning(
                    f"Post body from {model_name} exceeds the {BODY_MAX_SENTENCES}-sentence"
                    f"/{BODY_MAX_CHARS}-char cap. Asking for a shorter rewrite..."
                )
                rewrite_prompt = (
                    "Bài đăng Facebook dưới đây quá dài. Viết lại sao cho THÂN BÀI chỉ còn "
                    "TỐI ĐA 2 câu và dưới 280 ký tự, giữ nguyên dòng CTA có link, dòng "
                    "'Nguồn:' (nếu có) và dòng hashtag. Chỉ trả về bài đã viết lại, không "
                    "giải thích.\n\n" + post_text
                )
                try:
                    rewrite = client.models.generate_content(
                        model=model_name,
                        contents=rewrite_prompt,
                    )
                    short_text = clean_markdown(rewrite.text)
                    if validate_post_length(short_text):
                        return short_text
                except Exception as rewrite_err:
                    logger.error(f"Rewrite attempt with {model_name} failed: {rewrite_err}")
                logger.error("Post still too long after one rewrite. Skipping this run.")
                return None
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
