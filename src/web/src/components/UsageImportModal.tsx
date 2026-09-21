import { useRef, useState } from 'react';
import { api } from '../api.js';
import { showToast } from '../toast-bus.js';

interface Props {
  onClose: () => void;
  onImported: () => void;
}

export function UsageImportModal({ onClose, onImported }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{
    ok: true;
    total: number;
    skipped: number;
    dbIds: string[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleFile = (f: File) => {
    setFile(f);
    setPreview(null);
  };

  const readFileBase64 = (): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsDataURL(file!);
    });

  const handlePreview = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const base64 = await readFileBase64();
      const res = await api.importUsagePreview(base64);
      setPreview(res);
    } catch (e) {
      showToast('预览失败: ' + (e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview || !file) return;
    setSubmitting(true);
    try {
      const base64 = await readFileBase64();
      const res = await api.importUsageConfirm(base64);
      if (res.errors.length > 0) {
        showToast(`导入完成：新增 ${res.added}（${res.errors.length} 个错误）`, 'error');
      } else {
        showToast(`✓ 已导入 ${res.added} 条笔记`);
      }
      onImported();
      onClose();
    } catch (e) {
      showToast('导入失败: ' + (e as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop show" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-import">
        <h3>导入笔记</h3>
        <p className="modal-subtitle">选择 db-driver usage 备份 JSON 文件</p>

        <div className="modal-export-body">
          {!preview && (
            <div className="export-block">
              <div className="export-block-label"><span>选择文件</span></div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <div className="import-file-picker">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => fileInputRef.current?.click()}
                >
                  📁 选择文件
                </button>
                {file && (
                  <span className="import-file-info">
                    {file.name} <span className="import-file-size">({formatSize(file.size)})</span>
                  </span>
                )}
              </div>
              <div className="modal-export-footer" style={{ marginTop: 16, padding: '12px 0 0' }}>
                <button type="button" className="ghost" onClick={onClose}>
                  取消
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={!file || loading}
                  onClick={handlePreview}
                >
                  {loading ? '解析中...' : '预览'}
                </button>
              </div>
            </div>
          )}

          {preview && (
            <>
              <div className="export-block">
                <div className="export-block-label">
                  <span>预览 <span className="count">{preview.total}</span></span>
                  <span className="import-preview-summary">
                    关联 dbId: {preview.dbIds.join(', ') || '(无)'}
                    {preview.skipped > 0 ? ` · 跳过 ${preview.skipped} 条无效` : ''}
                  </span>
                </div>
                <div style={{ padding: '12px', background: 'rgba(37, 99, 235, 0.06)', borderRadius: 8, fontSize: 13, color: 'var(--text)' }}>
                  ✓ 准备新增 <strong>{preview.total}</strong> 条笔记
                  <br />
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                    每条笔记保留原有的 dbIds；index/addedAt 会重新分配
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {preview && (
          <div className="modal-export-footer">
            <button type="button" className="ghost" onClick={onClose} disabled={submitting}>
              取消
            </button>
            <button
              type="button"
              className="primary"
              disabled={submitting || preview.total === 0}
              onClick={handleConfirm}
            >
              {submitting ? '导入中...' : `确认导入 ${preview.total} 条`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}