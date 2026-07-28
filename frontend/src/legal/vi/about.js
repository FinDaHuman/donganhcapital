export default {
    title: 'Về dự án',
    version: '2026-08-01',
    updated: '01/08/2026',
    lead:
        'DongAnh Capital là một dự án nghiên cứu học thuật phi thương mại về ứng dụng học máy vào thị trường chứng khoán ' +
        'Việt Nam. Trang này công bố đầy đủ thông tin về bên vận hành nền tảng.',
    sections: [
        {
            heading: '1. Bên vận hành',
            body: [
                'Nền tảng do một cá nhân vận hành, dưới hình thức dự án nghiên cứu cá nhân trong quá trình học tập.',
                'Đây KHÔNG phải là doanh nghiệp. Không có giấy chứng nhận đăng ký kinh doanh, không có mã số thuế và không có ' +
                'trụ sở đăng ký, bởi vì nền tảng không kinh doanh và không cung cấp bất kỳ dịch vụ nào có thu phí.',
                'Địa bàn hoạt động: Khu Công nghệ cao Hòa Lạc, Hà Nội, Việt Nam.',
            ],
        },
        {
            heading: '2. Những gì dự án này KHÔNG phải',
            list: [
                'Không phải công ty chứng khoán và không có giấy phép của Uỷ ban Chứng khoán Nhà nước',
                'Không phải quỹ đầu tư hay công ty quản lý quỹ — chúng tôi không quản lý tiền của bất kỳ ai',
                'Không phải tổ chức môi giới — chúng tôi không nhận, chuyển hay thực hiện lệnh giao dịch',
                'Không phải tổ chức tư vấn đầu tư — chúng tôi không đưa ra khuyến nghị mua bán chứng khoán',
                'Không phải cơ quan báo chí — chúng tôi chỉ dẫn tiêu đề và trích đoạn ngắn kèm liên kết tới nguồn gốc',
            ],
        },
        {
            heading: '3. Nền tảng làm gì',
            body: [
                'Nền tảng thu thập dữ liệu giá và khối lượng của 226 mã cổ phiếu trên HOSE, HNX, UPCoM cùng hợp đồng ' +
                'tương lai VN30F1M, chạy các mô hình học máy trên dữ liệu đó, và công bố kết quả dưới dạng điểm số thống kê.',
                'Ba mô hình độc lập (LightGBM và XGBoost) được chạy sau mỗi phiên, lúc 15:02 giờ Việt Nam. Kết quả là mô tả ' +
                'thống kê về dữ liệu quá khứ, không phải chỉ dẫn hành động.',
                'Mục tiêu nghiên cứu là tìm hiểu điều mà học máy có thể và không thể nói cho chúng ta biết về thị trường ' +
                'Việt Nam. Chúng tôi công bố cả các hạn chế của mô hình, không chỉ các kết quả tích cực.',
            ],
        },
        {
            heading: '4. Miễn phí và phi thương mại',
            body: [
                'Toàn bộ nền tảng miễn phí. Không có gói trả phí, không có quảng cáo, không bán dữ liệu người dùng, và ' +
                'không có bất kỳ hình thức tạo doanh thu nào.',
                'Chi phí vận hành bằng không: nền tảng chạy hoàn toàn trên các gói miễn phí của các nhà cung cấp hạ tầng.',
            ],
        },
        {
            heading: '5. Liên hệ',
            body: [
                'Mọi thắc mắc, phản ánh hoặc yêu cầu liên quan đến dữ liệu cá nhân, vui lòng xem trang Liên hệ.',
            ],
            email: 'contact@donganhcapital.com',
        },
    ],
};
