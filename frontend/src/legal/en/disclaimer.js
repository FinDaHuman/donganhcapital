/**
 * English mirror of vi/disclaimer.js. Keep the two in sync — the `version`
 * fields must match, and the Vietnamese text governs in case of conflict.
 */
export default {
    title: 'Disclaimer',
    version: '2026-08-01',
    updated: '1 August 2026',
    lead:
        'Please read this page carefully before using DongAnh Capital. It defines the legal nature of every ' +
        'figure, signal and model output published on the platform.',
    sections: [
        {
            heading: '1. This is not an investment advisory service',
            body: [
                'DongAnh Capital is NOT a securities company, NOT an investment fund, NOT a fund management company, ' +
                'and NOT a securities broker.',
                'We hold no licence of any kind from the State Securities Commission of Vietnam (UBCKNN), and we do not ' +
                'provide the securities investment advisory service defined in Article 86 of the Securities Law 2019.',
                'Everything on this platform is provided for information, research and educational purposes only. Nothing ' +
                'here constitutes a recommendation to buy, sell or hold any security, and nothing here is an offer or ' +
                'solicitation to trade any financial instrument.',
            ],
        },
        {
            heading: '2. Model outputs are not recommendations',
            body: [
                'The signals, scores, probabilities and reference price levels shown on the platform are automated outputs ' +
                'of machine-learning models computed from historical data. They are statistical descriptions of the past, ' +
                'not instructions for you to act on.',
                'The models are applied identically for every user. We do not assess anyone’s investment objectives, ' +
                'financial situation, risk tolerance or personal needs, and therefore cannot and do not produce anything ' +
                'tailored to your circumstances.',
            ],
            note:
                'Levels labelled “Entry”, “Take Profit” or “Stop Loss” are technical thresholds the model derived from ' +
                'historical price data. They are not orders, not proposals to place orders, and not prices at which we ' +
                'believe you should trade.',
        },
        {
            heading: '3. A confidence score is not a win rate or a return',
            body: [
                'Where the platform shows a “confidence score” or “probability”, that number expresses how strongly a ' +
                'model scores a data pattern, measured against the dataset it was trained on.',
                'It is NOT a win rate, NOT an accuracy figure, and NOT a forecast of return. A signal with 87% confidence ' +
                'does not mean an 87% chance of making money.',
            ],
        },
        {
            heading: '4. Past performance does not guarantee future results',
            body: [
                'Every historical performance figure, backtest statistic and equity curve on the platform is computed over ' +
                'past data, under market conditions that have already occurred and will not repeat.',
                'Backtests are always subject to methodological bias, including but not limited to survivorship bias, ' +
                'look-ahead bias, transaction costs and slippage. We make no claim that any historical result is repeatable.',
            ],
        },
        {
            heading: '5. Investment risk',
            body: [
                'Investing in securities always carries risk, including the risk of losing part or all of your capital. The ' +
                'Vietnamese equity market can be highly volatile and is driven by factors no model accounts for.',
                'You are solely responsible for your investment decisions and for every consequence that follows from them. ' +
                'You should conduct your own independent research and consider consulting a licensed investment advisory ' +
                'firm before trading.',
            ],
        },
        {
            heading: '6. Data accuracy',
            body: [
                'Market data on the platform is sourced from third parties. We make reasonable efforts to keep it accurate ' +
                'and current, but we do not warrant the accuracy, completeness or timeliness of any data.',
                'Data may be delayed, incomplete or wrong. AI-generated content may contain errors. Do not use this platform ' +
                'as your only source of data for any financial decision.',
            ],
        },
        {
            heading: '7. Limitation of liability',
            body: [
                'To the fullest extent permitted by law, DongAnh Capital and its operator accept no liability for any loss ' +
                'or damage — including without limitation trading losses, lost opportunity or indirect damages — arising ' +
                'from your use of, or inability to use, the platform.',
                'The platform is provided free of charge, “as is”, without warranties of any kind.',
            ],
        },
        {
            heading: '8. Territorial scope',
            body: [
                'The platform is operated from Vietnam and governed by Vietnamese law. It is not directed at residents of ' +
                'any country or territory where providing content of this nature requires a local licence.',
                'In particular, the platform is not offered to “US persons” as defined under United States law, and nothing ' +
                'on it constitutes an offer of securities in any jurisdiction.',
                'If you access the platform from outside Vietnam, you are responsible for complying with the laws that apply ' +
                'where you live.',
            ],
        },
        {
            heading: '9. Governing language',
            body: [
                'This English text is provided for convenience. In the event of any conflict or inconsistency, the Vietnamese ' +
                'version of this document prevails.',
            ],
        },
    ],
};
