import { useRef, useState } from 'react';
import { api } from '../api.js';
import { showToast } from '../toast-bus.js';

interface PreviewItem {
  dbId: string;
  type: 'mysql' | 'postgres';
  host: string;
  port: number;
  user: string;
  database: string;
  description?: string;
  exists: boolean;
}

interface PreviewResult {
  ok: true;
  encrypted: boolean;
  total: number;
  newCount: number;
  conflictCount: number;
  connections: PreviewItem[];
}

interface Props {
  onClose: () => void;
  onImported: () => void;
}

export function ImportModal({ onClose, onImported }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [needsPassphrase, setNeedsPassphrase] = useState(false);
  const [mode, setMode] = useState<'skip' | 'replace'>('skip');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleFile = (f: File) => {
    setFile(f);
    setPreview(null);
    setNeedsPassphrase(false);
    setPassphrase('');
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
      const res = await api.importPreview(base64, passphrase || undefined);
      setPreview(res);
      setNeedsPassphrase(false);
    } catch (e) {
      const err = e as Error & { needsPassphrase?: boolean };
      if (err.needsPassphrase) {
        setNeedsPassphrase(true);
        showToast('文件是加密的，请输入 passphrase', 'error');
      } else {
        showToast('预览失败: ' + err.message, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview || !file) return;
    setSubmitting(true);
    try {
      const base64 = await readFileBase64();
      const res = await api.importConfirm(base64, passphrase || undefined, mode);
      const msg = `导入完成：新增 ${res.added}，替换 ${res.replaced}，跳过 ${res.skipped}（总 ${res.total}）`;
      if (res.errors.length > 0) {
        showToast(msg + `（${res.errors.length} 个错误）`, 'error');
      } else {
        showToast('✓ ' + msg);
      }
      onImported();
      onClose();
    } catch (e) {
      showToast('导入失败: ' + (e as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const canPreview = !!file && (!needsPassphrase || passphrase.length > 0);
  const canConfirm = !!preview && !submitting;

  return (
    <div className="modal-backdrop show" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-import">
        <h3>导入连接</h3>
        <p className="modal-subtitle">支持加密 .exp（需 passphrase）和明文 .json</p>

        <div className="modal-export-body">
          {!preview && (
            <>
              <div className="export-block">
                <div className="export-block-label"><span>选择文件</span></div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".exp,.json"
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
              </div>

              <div className="export-block">
                <div className="export-block-label">
                  <span>passphrase</span>
                  <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>
                    明文 .json 不需要；加密 .exp 必须
                  </span>
                  <button
                    type="button"
                    className="export-eye-btn"
                    onClick={() => setShowPassphrase((s) => !s)}
                    title={showPassphrase ? '隐藏 passphrase' : '显示 passphrase'}
                  >
                    {showPassphrase ? '🙈' : '👁'}
                  </button>
                </div>
                <div className="export-fields">
                  <div className="export-field" style={{ gridColumn: '1 / -1' }}>
                    <input
                      type={showPassphrase ? 'text' : 'password'}
                      value={passphrase}
                      placeholder="（明文 JSON 可留空）"
                      autoComplete="new-password"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      data-form-type="other"
                      data-lpignore="true"
                      data-1pignore="true"
                      data-bwignore="true"
                      data-dashlane-ignore="true"
                      name="passphrase-no-autofill"
                      onChange={(e) => setPassphrase(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {preview && (
            <>
              <div className="export-block">
                <div className="export-block-label">
                  <span>
                    预览 <span className="count">{preview.total}</span>
                  </span>
                  <span className="import-preview-summary">
                    新增 {preview.newCount} · 冲突 {preview.conflictCount}
                    {preview.encrypted ? ' · 🔒 加密' : ' · 📄 明文'}
                  </span>
                </div>
                <div className="export-list">
                  {preview.connections.map((c) => (
                    <div key={c.dbId} className="export-list-item">
                      <span className={'badge badge-' + c.type}>
                        {c.type === 'mysql' ? 'MySQL' : 'PG'}
                      </span>
                      <div className="export-list-text">
                        <span className="export-list-dbId">{c.dbId}</span>
                        <span className="export-list-meta">{c.user}@{c.host}:{c.port}/{c.database}</span>
                      </div>
                      {c.exists ? (
                        <span className="import-conflict-tag">已存在</span>
                      ) : (
                        <span className="import-new-tag">新增</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {preview.conflictCount > 0 && (
                <div className="export-block">
                  <div className="export-block-label"><span>冲突处理</span></div>
                  <div className="import-mode-group">
                    <label className={'import-mode-option' + (mode === 'skip' ? ' active' : '')}>
                      <input
                        type="radio"
                        name="mode"
                        checked={mode === 'skip'}
                        onChange={() => setMode('skip')}
                      />
                      <span>
                        <strong>跳过已存在</strong>
                        <span className="import-mode-desc">只导入新增的，冲突的保持原样</span>
                      </span>
                    </label>
                    <label className={'import-mode-option' + (mode === 'replace' ? ' active' : '')}>
                      <input
                        type="radio"
                        name="mode"
                        checked={mode === 'replace'}
                        onChange={() => setMode('replace')}
                      />
                      <span>
                        <strong>替换已存在</strong>
                        <span className="import-mode-desc">用备份里的配置覆盖现有</span>
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-export-footer">
          <button type="button" className="ghost" onClick={onClose} disabled={submitting}>
            取消
          </button>
          {!preview ? (
            <button
              type="button"
              className="primary"
              disabled={!canPreview}
              onClick={handlePreview}
            >
              {loading ? '解析中...' : '预览'}
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              disabled={!canConfirm}
              onClick={handleConfirm}
            >
              {submitting
                ? '导入中...'
                : mode === 'replace'
                  ? `替换 ${preview.conflictCount} + 新增 ${preview.newCount}`
                  : `导入 ${preview.newCount} 个新连接`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}