/**
 * Single source of truth for the operator identity shown in the footer,
 * the /about and /contact pages, and every legal document.
 *
 * DongAnh Capital is a NON-COMMERCIAL student research project. It is not a
 * company, not a securities firm, and nothing on the site is offered for sale.
 * Keep it that way: if any of this stops being true, the legal pages, the
 * pricing surface and the tax/registration position all have to change together.
 *
 * TODO(Finn): fill in `operatorName` and `institution` before deploying. The
 * Terms name the operator as the contracting party — a document that names
 * nobody is not enforceable, which is the gap this file exists to close.
 */
export const COMPANY = {
    // Brand shown in the UI.
    tradingName: 'DongAnh Capital',

    // The natural person who operates the site and is the data controller.
    operatorName: '[TODO: họ và tên đầy đủ của người vận hành]',

    // Academic affiliation, if you want to state it. Leave '' to omit the line.
    institution: '',

    // Nature of the project — surfaced verbatim on /about.
    natureVi: 'Dự án nghiên cứu học thuật phi thương mại',
    natureEn: 'Non-commercial academic research project',

    // No entity exists, and that is deliberate. These stay null so the UI
    // renders "không áp dụng" rather than an empty field that looks like an omission.
    legalName: null,
    taxCode: null,
    businessRegNo: null,

    // Contact.
    email: 'support@donganhcapital.com',
    contactEmail: 'contact@donganhcapital.com',
    // Data-protection / privacy requests (Luật 91/2025 requires a working channel).
    privacyEmail: 'support@donganhcapital.com',

    locationVi: 'Hà Nội, Việt Nam',
    locationEn: 'Hanoi, Vietnam',

    site: 'https://www.donganhcapital.com',
    facebook: 'https://www.facebook.com/profile.php?id=61590323739631',
    youtube: 'https://www.youtube.com/@DongAnhCapital',

    // Governing law for both language versions.
    governingLawVi: 'Pháp luật Việt Nam',
    governingLawEn: 'the laws of Vietnam',
    jurisdictionVi: 'Toà án nhân dân có thẩm quyền tại Hà Nội',
    jurisdictionEn: 'the competent People’s Court in Hanoi',
};

export default COMPANY;
