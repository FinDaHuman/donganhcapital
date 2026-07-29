export default {
    title: 'About This Project',
    version: '2026-08-01',
    updated: '1 August 2026',
    lead:
        'DongAnh Capital is a non-commercial academic research project on applying machine learning to the Vietnamese ' +
        'equity market. This page discloses in full who operates the platform.',
    sections: [
        {
            heading: '1. The team',
            body: [
                'DongAnh Capital is a research project by a team of five students currently studying at FPT University:',
            ],
            list: [
                'Đoàn Duy Long — Team Leader',
                'Trần Huy Tuấn — Member, platform operations',
                'Nguyễn Nhật Minh — Member',
                'Đoàn Minh Hiếu — Member',
                'Hoàng Hiếu Trung — Member',
            ],
            note:
                'This is independent student research. It is NOT an official product of FPT University, and the ' +
                'university neither sponsors it nor bears responsibility for its content.',
        },
        {
            heading: '2. Legal status',
            body: [
                'This is NOT a company. There is no business registration certificate, no tax code and no registered ' +
                'office, because the platform does not trade and offers no service for a fee.',
                'The contact and responsible operator of the platform is Mr Trần Huy Tuấn.',
                'Based in: Hoa Lac Hi-Tech Park, Hanoi, Vietnam.',
            ],
        },
        {
            heading: '3. What this project is NOT',
            list: [
                'Not a securities company, and not licensed by the State Securities Commission of Vietnam',
                'Not an investment fund or fund manager — we manage no one’s money',
                'Not a broker — we do not receive, route or execute orders',
                'Not an investment advisory firm — we make no buy or sell recommendations',
                'Not a press outlet — we show only headlines and short excerpts, linking to the original source',
            ],
        },
        {
            heading: '4. What the platform does',
            body: [
                'It collects price and volume data for 226 tickers across HOSE, HNX and UPCoM, plus the VN30F1M futures ' +
                'contract, runs machine-learning models over that data, and publishes the results as statistical scores.',
                'Three independent models (LightGBM and XGBoost) run after each session, at 15:02 Vietnam time. The outputs ' +
                'are statistical descriptions of past data, not instructions to act.',
                'The research question is what machine learning can and cannot tell us about the Vietnamese market. We ' +
                'publish the limitations of the models, not only the favourable results.',
            ],
        },
        {
            heading: '5. Free and non-commercial',
            body: [
                'The entire platform is free. There is no paid tier, no advertising, no sale of user data, and no revenue ' +
                'of any kind.',
                'Running costs are zero: the platform runs entirely on free-tier plans from its infrastructure providers.',
            ],
        },
        {
            heading: '6. Contact',
            body: ['For any question, report or personal-data request, please see the Contact page.'],
            email: 'contact@donganhcapital.com',
        },
    ],
};
