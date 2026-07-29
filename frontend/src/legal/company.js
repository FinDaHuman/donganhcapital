/**
 * Single source of truth for the operator identity shown in the footer,
 * the /about and /contact pages, and every legal document.
 *
 * DongAnh Capital is a NON-COMMERCIAL student research project. It is not a
 * company, not a securities firm, and nothing on the site is offered for sale.
 * Keep it that way: if any of this stops being true, the legal pages, the
 * pricing surface and the tax/registration position all have to change together.
 *
 * The Terms name the operator as the contracting party — a document that names
 * nobody is not enforceable, which is the gap this file exists to close.
 */
export const COMPANY = {
    // Brand shown in the UI.
    tradingName: 'DongAnh Capital',

    // The natural person who operates the site. Named in the Terms as the
    // contracting party and in the Privacy Policy as the data controller — those
    // roles need one identifiable person, which is why this is a single name and
    // not the whole team below.
    operatorName: 'Trần Huy Tuấn',

    // Where the team studies. Stated as "students at", never as a project by or
    // endorsed by the university — see the note on TEAM.
    institution: 'Đại học FPT (FPT University)',
    institutionShort: 'Đại học FPT',

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
    // The project team. All five are current students at FPT University.
    //
    // Deliberately does NOT claim the project is run, sponsored or endorsed by
    // FPT University: "a project by students who study there" and "a university
    // project" are different claims, and only the first one is ours to make.
    // If this ever becomes an official capstone with the university's backing,
    // that is a different statement and needs its own wording.
    team: [
        { name: 'Đoàn Duy Long', roleVi: 'Trưởng nhóm', roleEn: 'Team Leader' },
        { name: 'Trần Huy Tuấn', roleVi: 'Thành viên', roleEn: 'Member' },
        { name: 'Nguyễn Nhật Minh', roleVi: 'Thành viên', roleEn: 'Member' },
        { name: 'Đoàn Minh Hiếu', roleVi: 'Thành viên', roleEn: 'Member' },
        { name: 'Hoàng Hiếu Trung', roleVi: 'Thành viên', roleEn: 'Member' },
    ],

    governingLawVi: 'Pháp luật Việt Nam',
    governingLawEn: 'the laws of Vietnam',
    jurisdictionVi: 'Toà án nhân dân có thẩm quyền tại Hà Nội',
    jurisdictionEn: 'the competent People’s Court in Hanoi',
};

export default COMPANY;
