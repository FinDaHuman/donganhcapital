import React, { useState } from 'react';
import { Download, Trash2, AlertTriangle } from 'lucide-react';

/**
 * Self-service data-subject rights: export and erasure.
 *
 * Deliberately makes deletion harder than export. Export is one click; deletion
 * requires opening a confirmation panel, typing your own email address back, and
 * (for password accounts) re-entering your password. The asymmetry is the point —
 * an accidental export costs nothing, an accidental deletion is unrecoverable.
 */
const DataRightsPanel = ({ email, authApi, onDeleted }) => {
    const [exporting, setExporting] = useState(false);
    const [exportMsg, setExportMsg] = useState('');
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [typedEmail, setTypedEmail] = useState('');
    const [password, setPassword] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');

    const handleExport = async () => {
        setExporting(true);
        setExportMsg('');
        try {
            const res = await authApi.get('/api/account/export');
            // Build the download client-side: the endpoint sets Content-Disposition,
            // but XHR does not honour it, so the blob has to be saved manually.
            const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'donganhcapital-data-export.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setExportMsg('Đã tải xuống dữ liệu của bạn.');
        } catch (err) {
            setExportMsg(
                err?.response?.status === 429
                    ? 'Bạn chỉ có thể tải dữ liệu một lần mỗi 24 giờ.'
                    : 'Không tải được dữ liệu. Vui lòng thử lại sau.'
            );
        } finally {
            setExporting(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        setDeleteError('');
        try {
            await authApi.delete('/api/account', {
                data: { confirm_email: typedEmail.trim(), password: password || undefined },
            });
            onDeleted && onDeleted();
        } catch (err) {
            setDeleteError(
                err?.response?.data?.detail || 'Không xoá được tài khoản. Vui lòng thử lại.'
            );
            setDeleting(false);
        }
    };

    const canDelete = typedEmail.trim().toLowerCase() === (email || '').toLowerCase() && !deleting;

    const card = {
        background: 'var(--bg-surface)',
        border: '1px solid rgba(201,169,110,0.12)',
    };

    return (
        <div className="flex flex-col gap-4">
            {/* Export */}
            <div className="rounded-2xl p-6" style={card}>
                <div className="flex items-start gap-4">
                    <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: 'rgba(201,169,110,0.1)', border: '1px solid var(--gold-border)' }}
                    >
                        <Download size={20} style={{ color: 'var(--gold-primary)' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                            Tải xuống dữ liệu của bạn
                        </p>
                        <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--text-muted)' }}>
                            Toàn bộ dữ liệu cá nhân chúng tôi lưu về bạn, dưới dạng tệp JSON — hồ sơ, lịch sử
                            chấp thuận điều khoản và giao dịch. Mật khẩu không được bao gồm vì chỉ lưu ở dạng băm.
                        </p>
                        <button
                            onClick={handleExport}
                            disabled={exporting}
                            className="px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                            style={{
                                background: 'rgba(201,169,110,0.12)',
                                border: '1px solid rgba(201,169,110,0.25)',
                                color: 'var(--gold-primary)',
                                opacity: exporting ? 0.6 : 1,
                            }}
                        >
                            {exporting ? 'Đang chuẩn bị…' : 'Tải xuống (JSON)'}
                        </button>
                        {exportMsg && (
                            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{exportMsg}</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Delete */}
            <div className="rounded-2xl p-6" style={{ ...card, border: '1px solid rgba(239,68,68,0.2)' }}>
                <div className="flex items-start gap-4">
                    <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
                    >
                        <Trash2 size={20} style={{ color: '#ef4444' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                            Xoá tài khoản
                        </p>
                        <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--text-muted)' }}>
                            Email, họ tên, ảnh đại diện và mọi mã định danh của bạn sẽ bị xoá vĩnh viễn.
                            Bản ghi giao dịch được giữ ở dạng ẩn danh theo quy định về lưu trữ chứng từ.
                            Thao tác này không thể hoàn tác.
                        </p>

                        {!confirmOpen ? (
                            <button
                                onClick={() => setConfirmOpen(true)}
                                className="px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                                style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}
                            >
                                Tôi muốn xoá tài khoản
                            </button>
                        ) : (
                            <div className="flex flex-col gap-2.5">
                                <div
                                    className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs leading-relaxed"
                                    style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', color: '#fca5a5' }}
                                >
                                    <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                                    <span>Nhập <strong>{email}</strong> để xác nhận.</span>
                                </div>
                                <input
                                    type="email"
                                    value={typedEmail}
                                    onChange={(e) => setTypedEmail(e.target.value)}
                                    placeholder={email}
                                    autoComplete="off"
                                    className="px-3 py-2 rounded-lg text-sm"
                                    style={{ background: 'var(--bg-elevated)', border: '1px solid rgba(201,169,110,0.15)', color: 'var(--text-primary)', outline: 'none' }}
                                />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Mật khẩu (nếu đăng nhập bằng email)"
                                    autoComplete="current-password"
                                    className="px-3 py-2 rounded-lg text-sm"
                                    style={{ background: 'var(--bg-elevated)', border: '1px solid rgba(201,169,110,0.15)', color: 'var(--text-primary)', outline: 'none' }}
                                />
                                {deleteError && <p className="text-xs" style={{ color: '#ef4444' }}>{deleteError}</p>}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleDelete}
                                        disabled={!canDelete}
                                        className="px-4 py-2 rounded-xl text-xs font-semibold"
                                        style={{
                                            background: canDelete ? '#ef4444' : 'rgba(239,68,68,0.2)',
                                            border: 'none',
                                            color: canDelete ? '#fff' : 'rgba(255,255,255,0.4)',
                                            cursor: canDelete ? 'pointer' : 'not-allowed',
                                        }}
                                    >
                                        {deleting ? 'Đang xoá…' : 'Xoá vĩnh viễn'}
                                    </button>
                                    <button
                                        onClick={() => { setConfirmOpen(false); setTypedEmail(''); setPassword(''); setDeleteError(''); }}
                                        className="px-4 py-2 rounded-xl text-xs cursor-pointer"
                                        style={{ background: 'transparent', border: '1px solid rgba(201,169,110,0.2)', color: 'var(--text-muted)' }}
                                    >
                                        Huỷ
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DataRightsPanel;
