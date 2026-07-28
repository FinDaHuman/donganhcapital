export default {
    title: 'Chính sách cookie',
    version: '2026-08-01',
    updated: '01/08/2026',
    lead:
        'Nền tảng chỉ sử dụng các cookie thực sự cần thiết để đăng nhập hoạt động. Chúng tôi không dùng cookie quảng cáo, ' +
        'không theo dõi bạn giữa các website, và hiện không cài đặt bất kỳ công cụ phân tích hành vi nào.',
    sections: [
        {
            heading: '1. Cookie chúng tôi sử dụng',
            body: ['Toàn bộ danh sách — không có cookie nào khác được đặt:'],
            list: [
                'dac_access_token — mã thông báo phiên đăng nhập. httpOnly (JavaScript không đọc được), hiệu lực 15 phút.',
                'dac_refresh_token — dùng để gia hạn phiên. httpOnly, hiệu lực 7 ngày, chỉ được gửi tới đường dẫn gia hạn.',
                'dac_session — chỉ chứa giá trị "1", báo cho giao diện biết trình duyệt này đang có phiên. Không chứa mã thông báo và không chứa dữ liệu cá nhân. Hiệu lực 7 ngày.',
            ],
        },
        {
            heading: '2. Dữ liệu lưu trong trình duyệt',
            body: [
                'Ngoài cookie, nền tảng lưu một vài mục trong localStorage của trình duyệt bạn — dữ liệu này không được ' +
                'gửi về máy chủ:',
            ],
            list: [
                'dac_locale — ngôn ngữ bạn chọn cho các trang pháp lý',
                'dac_cookie_consent — lựa chọn của bạn ở thanh thông báo cookie',
                'Bộ nhớ đệm dữ liệu thị trường, giúp trang tải nhanh hơn ở lần truy cập sau',
            ],
        },
        {
            heading: '3. Cookie của bên thứ ba',
            body: [
                'Chúng tôi không đặt cookie quảng cáo hay cookie theo dõi. Nếu bạn chọn đăng nhập bằng Google, Google có thể ' +
                'đặt cookie của riêng họ trong quá trình xác thực — việc đó do chính sách quyền riêng tư của Google điều chỉnh.',
            ],
        },
        {
            heading: '4. Từ chối cookie',
            body: [
                'Các cookie nêu ở mục 1 là bắt buộc để chức năng đăng nhập hoạt động; không thể tắt riêng chúng mà vẫn ' +
                'duy trì được phiên đăng nhập. Bạn có thể sử dụng phần lớn nội dung công khai của nền tảng mà không cần ' +
                'đăng nhập, và có thể xoá cookie bất kỳ lúc nào trong cài đặt trình duyệt.',
                'Nếu trong tương lai chúng tôi bổ sung công cụ phân tích, công cụ đó sẽ chỉ hoạt động sau khi bạn đồng ý ' +
                'ở thanh thông báo cookie.',
            ],
        },
    ],
};
