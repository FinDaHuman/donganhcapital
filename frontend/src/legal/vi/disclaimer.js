/**
 * Miễn trừ trách nhiệm — the single most important page on this site.
 *
 * It exists because Điều 12.4 Luật Chứng khoán 2019 prohibits providing
 * securities services without a UBCKNN licence, and Điều 86.4 defines the
 * licensed activity as issuing analysis and recommendations to buy, sell or
 * hold securities. This page states plainly what DongAnh Capital is (a
 * statistical tool) and is not (an advisory service). Do not soften it.
 */
export default {
    title: 'Miễn trừ trách nhiệm',
    version: '2026-08-01',
    updated: '01/08/2026',
    lead:
        'Vui lòng đọc kỹ trang này trước khi sử dụng DongAnh Capital. Nội dung dưới đây quy định bản chất pháp lý ' +
        'của toàn bộ thông tin, số liệu và kết quả mô hình được công bố trên nền tảng.',
    sections: [
        {
            heading: '1. Đây không phải là dịch vụ tư vấn đầu tư',
            body: [
                'DongAnh Capital KHÔNG phải là công ty chứng khoán, KHÔNG phải là quỹ đầu tư, KHÔNG phải là công ty ' +
                'quản lý quỹ và KHÔNG phải là tổ chức môi giới chứng khoán.',
                'Chúng tôi KHÔNG được Uỷ ban Chứng khoán Nhà nước (UBCKNN) cấp bất kỳ giấy phép nào, và KHÔNG cung cấp ' +
                'nghiệp vụ tư vấn đầu tư chứng khoán theo quy định tại Điều 86 Luật Chứng khoán 2019.',
                'Toàn bộ nội dung trên nền tảng chỉ mang tính chất thông tin, nghiên cứu và giáo dục. Không có nội dung nào ' +
                'cấu thành khuyến nghị mua, bán hoặc nắm giữ chứng khoán, và không nội dung nào là lời chào mời hay lời mời ' +
                'chào mua bán bất kỳ công cụ tài chính nào.',
            ],
        },
        {
            heading: '2. Kết quả mô hình không phải là khuyến nghị',
            body: [
                'Các tín hiệu, điểm số, xác suất và mức giá tham chiếu hiển thị trên nền tảng là kết quả tính toán tự động ' +
                'của các mô hình học máy dựa trên dữ liệu lịch sử. Chúng là mô tả thống kê về dữ liệu quá khứ, không phải là ' +
                'chỉ dẫn hành động dành cho bạn.',
                'Các mô hình được áp dụng đồng nhất cho tất cả người dùng. Chúng tôi không đánh giá mục tiêu đầu tư, tình hình ' +
                'tài chính, khả năng chịu rủi ro hay nhu cầu cá nhân của bất kỳ ai, và do đó không thể và không hề đưa ra ' +
                'bất kỳ nội dung nào phù hợp riêng cho hoàn cảnh của bạn.',
            ],
            note:
                'Các mức giá được gọi là "Entry", "Take Profit" hay "Stop Loss" là ngưỡng kỹ thuật do mô hình tính ra từ ' +
                'dữ liệu giá quá khứ. Đó không phải là lệnh, không phải là đề nghị đặt lệnh, và không phải là mức giá mà ' +
                'chúng tôi cho rằng bạn nên giao dịch.',
        },
        {
            heading: '3. Điểm tin cậy không phải là tỷ lệ thắng hay lợi nhuận',
            body: [
                'Khi nền tảng hiển thị một "điểm tin cậy" hoặc "xác suất", con số đó thể hiện mức độ mà mô hình đánh giá ' +
                'một mẫu hình dữ liệu, tính trên tập dữ liệu huấn luyện của nó.',
                'Con số đó KHÔNG phải là tỷ lệ thắng, KHÔNG phải là độ chính xác, và KHÔNG phải là dự báo lợi nhuận. ' +
                'Một tín hiệu có điểm tin cậy 87% không có nghĩa là 87% khả năng sinh lời.',
            ],
        },
        {
            heading: '4. Kết quả quá khứ không bảo đảm kết quả tương lai',
            body: [
                'Mọi số liệu hiệu suất lịch sử, thống kê kiểm định (backtest) và biểu đồ vốn trên nền tảng đều được tính ' +
                'trên dữ liệu quá khứ, trong điều kiện thị trường đã xảy ra và không lặp lại.',
                'Kiểm định trên dữ liệu lịch sử luôn chịu ảnh hưởng của các sai lệch phương pháp luận, bao gồm nhưng không ' +
                'giới hạn ở sai lệch sống sót, nhìn trước dữ liệu, chi phí giao dịch và trượt giá. Chúng tôi không tuyên bố ' +
                'rằng bất kỳ kết quả lịch sử nào có thể tái lập trong tương lai.',
            ],
        },
        {
            heading: '5. Rủi ro đầu tư',
            body: [
                'Đầu tư chứng khoán luôn tiềm ẩn rủi ro, bao gồm rủi ro mất một phần hoặc toàn bộ vốn. Thị trường chứng khoán ' +
                'Việt Nam có thể biến động mạnh và chịu tác động của các yếu tố nằm ngoài phạm vi mô hình.',
                'Bạn hoàn toàn tự chịu trách nhiệm về mọi quyết định đầu tư của mình và mọi hậu quả phát sinh từ các quyết định đó. ' +
                'Bạn nên tự nghiên cứu độc lập và cân nhắc tham vấn một tổ chức tư vấn đầu tư được cấp phép trước khi giao dịch.',
            ],
        },
        {
            heading: '6. Độ chính xác của dữ liệu',
            body: [
                'Dữ liệu thị trường trên nền tảng được thu thập từ các nguồn bên thứ ba. Chúng tôi cố gắng bảo đảm dữ liệu ' +
                'chính xác và cập nhật, nhưng không bảo đảm tính chính xác, đầy đủ hoặc kịp thời của bất kỳ dữ liệu nào.',
                'Dữ liệu có thể bị chậm, thiếu hoặc sai lệch. Nội dung do trí tuệ nhân tạo tạo ra có thể chứa sai sót. ' +
                'Không sử dụng nền tảng này làm nguồn dữ liệu duy nhất cho bất kỳ quyết định tài chính nào.',
            ],
        },
        {
            heading: '7. Giới hạn trách nhiệm',
            body: [
                'Trong phạm vi tối đa mà pháp luật cho phép, DongAnh Capital và người vận hành không chịu trách nhiệm đối với ' +
                'bất kỳ tổn thất hay thiệt hại nào — bao gồm nhưng không giới hạn ở thua lỗ trong giao dịch, mất cơ hội hoặc ' +
                'thiệt hại gián tiếp — phát sinh từ việc sử dụng hoặc không thể sử dụng nền tảng.',
                'Nền tảng được cung cấp miễn phí, "nguyên trạng", không kèm theo bất kỳ bảo đảm nào dưới bất kỳ hình thức nào.',
            ],
        },
        {
            heading: '8. Phạm vi lãnh thổ',
            body: [
                'Nền tảng được vận hành từ Việt Nam và tuân theo pháp luật Việt Nam. Nền tảng không hướng tới người cư trú ' +
                'tại các quốc gia hoặc vùng lãnh thổ mà việc cung cấp nội dung như trên đòi hỏi giấy phép tại địa phương.',
                'Nền tảng đặc biệt không được cung cấp cho "US persons" theo định nghĩa của pháp luật Hoa Kỳ, và không cấu thành ' +
                'lời chào bán chứng khoán tại bất kỳ quốc gia nào.',
                'Nếu bạn truy cập từ ngoài Việt Nam, bạn tự chịu trách nhiệm tuân thủ pháp luật tại nơi cư trú của mình.',
            ],
        },
    ],
};
