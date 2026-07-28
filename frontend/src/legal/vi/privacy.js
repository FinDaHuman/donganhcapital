/**
 * Chính sách bảo mật, viết theo Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15
 * (hiệu lực 01/01/2026) và Nghị định 356/2025/NĐ-CP.
 *
 * Điểm quan trọng: mọi bên xử lý dữ liệu nêu ở mục 5 đều phải khớp với thực tế
 * hạ tầng. Nếu thêm/bớt một dịch vụ bên thứ ba, phải cập nhật mục này VÀ tăng
 * `version` ở đây và trong backend/utils/legal.py để người dùng được hỏi lại.
 */
export default {
    title: 'Chính sách bảo mật dữ liệu cá nhân',
    version: '2026-08-01',
    updated: '01/08/2026',
    lead:
        'Chính sách này giải thích chúng tôi thu thập dữ liệu cá nhân nào, dùng để làm gì, chia sẻ với ai, lưu trong bao lâu ' +
        'và bạn có những quyền gì. Chính sách được xây dựng theo Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và ' +
        'Nghị định 356/2025/NĐ-CP.',
    sections: [
        {
            heading: '1. Bên kiểm soát dữ liệu',
            body: [
                'Bên kiểm soát dữ liệu cá nhân là cá nhân vận hành DongAnh Capital — một dự án nghiên cứu học thuật ' +
                'phi thương mại, không phải doanh nghiệp.',
                'Mọi yêu cầu liên quan đến dữ liệu cá nhân xin gửi về: support@donganhcapital.com',
            ],
        },
        {
            heading: '2. Dữ liệu cá nhân chúng tôi thu thập',
            body: ['Khi bạn tạo tài khoản và sử dụng nền tảng, chúng tôi lưu trữ:'],
            list: [
                'Địa chỉ email (bắt buộc — dùng để đăng nhập và xác thực tài khoản)',
                'Họ tên, nếu bạn cung cấp',
                'Ảnh đại diện và mã định danh Google, nếu bạn đăng nhập bằng Google',
                'Mật khẩu ở dạng băm bcrypt — chúng tôi không bao giờ lưu mật khẩu gốc',
                'Tuỳ chọn giao diện (ví dụ: khẩu vị rủi ro bạn chọn để sắp xếp hiển thị)',
                'Trạng thái xác thực email, thời điểm tạo tài khoản và thời điểm cập nhật gần nhất',
                'Số lượt sử dụng tính năng AI trong ngày, để thực thi hạn mức chung',
                'Nhật ký chấp thuận điều khoản: phiên bản tài liệu, thời điểm và mã băm địa chỉ IP',
            ],
            note:
                'Chúng tôi KHÔNG thu thập thông tin thanh toán, số tài khoản ngân hàng, số CMND/CCCD, dữ liệu sinh trắc học, ' +
                'dữ liệu vị trí, hay bất kỳ dữ liệu cá nhân nhạy cảm nào theo Luật 91/2025.',
        },
        {
            heading: '3. Dữ liệu chúng tôi cố ý KHÔNG lưu',
            list: [
                'Nội dung bạn trò chuyện với trợ lý AI — các cuộc hội thoại không được lưu trên máy chủ của chúng tôi',
                'Địa chỉ IP dưới dạng nguyên bản — chỉ mã băm có muối được lưu trong nhật ký chấp thuận',
                'Danh mục đầu tư, lệnh giao dịch hay bất kỳ dữ liệu tài khoản chứng khoán nào của bạn',
                'Thông tin thẻ hoặc bất kỳ phương tiện thanh toán nào',
            ],
            note:
                'Máy chủ ứng dụng có ghi nhật ký truy cập kỹ thuật (đường dẫn, thời điểm, địa chỉ IP do nhà cung cấp hạ tầng ' +
                'ghi lại) theo cấu hình mặc định của nền tảng lưu trữ. Chúng tôi không phân tích các nhật ký này để theo dõi ' +
                'hành vi người dùng.',
        },
        {
            heading: '4. Mục đích và căn cứ xử lý',
            list: [
                'Tạo và duy trì tài khoản của bạn — thực hiện thoả thuận sử dụng giữa bạn và chúng tôi',
                'Xác thực email để ngăn tài khoản giả mạo làm cạn kiệt hạn mức API miễn phí — lợi ích hợp pháp',
                'Gửi email giao dịch bắt buộc (xác thực, đặt lại mật khẩu) — thực hiện thoả thuận',
                'Thực thi hạn mức sử dụng tính năng AI — lợi ích hợp pháp trong việc duy trì dịch vụ',
                'Lưu bằng chứng chấp thuận điều khoản — nghĩa vụ pháp lý theo Luật 91/2025',
                'Gửi email giới thiệu hoặc khảo sát — chỉ khi bạn đồng ý, và có thể huỷ bất kỳ lúc nào',
            ],
        },
        {
            heading: '5. Các bên xử lý dữ liệu và chuyển dữ liệu ra nước ngoài',
            body: [
                'Nền tảng chạy hoàn toàn trên hạ tầng miễn phí của các nhà cung cấp quốc tế. Điều này đồng nghĩa dữ liệu ' +
                'cá nhân của bạn được lưu trữ và xử lý bên ngoài lãnh thổ Việt Nam. Danh sách đầy đủ:',
            ],
            list: [
                'Neon (PostgreSQL) — lưu toàn bộ dữ liệu tài khoản',
                'Render — vận hành máy chủ ứng dụng',
                'Vercel — phân phối giao diện web',
                'Cloudflare — CDN, bảo vệ và lưu trữ tệp PDF (R2)',
                'MongoDB Atlas — lưu dữ liệu tin tức (không chứa dữ liệu cá nhân)',
                'Resend — gửi email giao dịch; nhận địa chỉ email của bạn',
                'Google Gemini — xử lý nội dung bạn nhập vào trợ lý AI; nội dung được gửi đi để tạo câu trả lời và không được chúng tôi lưu lại',
                'Google — nếu bạn chọn đăng nhập bằng tài khoản Google',
            ],
            note:
                'Bằng việc sử dụng nền tảng, bạn hiểu và đồng ý với việc chuyển dữ liệu cá nhân ra nước ngoài như mô tả trên. ' +
                'Nếu bạn không muốn nội dung của mình được gửi tới Google Gemini, đơn giản là không sử dụng tính năng trợ lý AI ' +
                'và phân tích tin tức.',
        },
        {
            heading: '6. Thời gian lưu trữ',
            list: [
                'Dữ liệu tài khoản: lưu trong suốt thời gian tài khoản tồn tại',
                'Mã thông báo đặt lại mật khẩu: 60 phút; mã xác thực email: 24 giờ',
                'Bộ đếm hạn mức AI: ghi đè mỗi ngày',
                'Nhật ký chấp thuận: lưu lâu dài làm bằng chứng tuân thủ, kể cả sau khi tài khoản bị xoá',
                'Dấu hiệu đã sử dụng chương trình dùng thử: lưu lâu dài, nhằm ngăn việc tạo lại tài khoản để lạm dụng',
            ],
            note:
                'Khi bạn yêu cầu xoá tài khoản, chúng tôi ẩn danh hoá dữ liệu của bạn thay vì xoá cứng bản ghi: email, họ tên, ' +
                'ảnh đại diện và mọi mã định danh bị xoá bỏ, chỉ giữ lại bản ghi kỹ thuật không còn khả năng xác định danh tính.',
        },
        {
            heading: '7. Quyền của bạn',
            body: ['Theo Luật 91/2025, bạn có các quyền sau đối với dữ liệu cá nhân của mình:'],
            list: [
                'Quyền được biết — chính sách này thực hiện quyền đó',
                'Quyền truy cập và mang dữ liệu đi — tải toàn bộ dữ liệu của bạn dưới dạng tệp JSON từ trang Hồ sơ',
                'Quyền chỉnh sửa — sửa họ tên và tuỳ chọn trong trang Hồ sơ',
                'Quyền xoá — yêu cầu xoá tài khoản từ trang Hồ sơ',
                'Quyền rút lại sự đồng ý — huỷ nhận email bất kỳ lúc nào qua liên kết trong mỗi email',
                'Quyền hạn chế hoặc phản đối việc xử lý',
                'Quyền khiếu nại tới cơ quan nhà nước có thẩm quyền',
            ],
            note: 'Chúng tôi phản hồi mọi yêu cầu về dữ liệu cá nhân trong vòng 72 giờ làm việc.',
        },
        {
            heading: '8. Bảo mật và sự cố dữ liệu',
            body: [
                'Chúng tôi áp dụng: băm mật khẩu bằng bcrypt, mã thông báo phiên lưu trong cookie httpOnly (JavaScript không ' +
                'đọc được), kết nối HTTPS, giới hạn tần suất đăng nhập và khoá tài khoản khi có dấu hiệu tấn công dò mật khẩu.',
                'Không có hệ thống nào an toàn tuyệt đối. Nếu xảy ra sự cố xâm phạm dữ liệu cá nhân, chúng tôi sẽ thông báo ' +
                'cho cơ quan chuyên trách trong vòng 72 giờ kể từ khi phát hiện, theo Điều 23 Luật 91/2025, và thông báo cho ' +
                'người dùng bị ảnh hưởng.',
            ],
        },
        {
            heading: '9. Trẻ em',
            body: [
                'Nền tảng không dành cho người dưới 18 tuổi và chúng tôi không cố ý thu thập dữ liệu của trẻ em. Nếu bạn cho ' +
                'rằng chúng tôi đã vô tình thu thập dữ liệu của trẻ em, vui lòng liên hệ để chúng tôi xoá bỏ.',
            ],
        },
        {
            heading: '10. Thay đổi chính sách',
            body: [
                'Khi chính sách này thay đổi, phiên bản và ngày cập nhật ở đầu trang sẽ được điều chỉnh. Với các thay đổi ' +
                'quan trọng, người dùng đã đăng ký sẽ được yêu cầu xác nhận lại khi đăng nhập.',
            ],
        },
    ],
};
