import { useState } from 'react';
import { api } from '../api.js';
import { showToast } from '../toast-bus.js';
import type { DbConnectionConfig } from '../types.js';

interface Props {
  list: DbConnectionConfig[];
  onClose: () => void;
}

export function ExportModal({ list, onClose }: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(list.map((c) => c.dbId)));
  const [passphrase, setPassphrase] = useState('');
  const [passphrase2, setPassphrase2] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const allSelected = selected.size === list.length;
  const noneSelected = selected.size === 0;
  const toggle = (dbId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(dbId)) next.delete(dbId);
      else next.add(dbId);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(list.map((c) => c.dbId)));
  const selectNone = () => setSelected(new Set());
  const invert = () =>
    setSelected(new Set(list.filter((c) => !selected.has(c.dbId)).map((c) => c.dbId)));

  const passphraseFilled = passphrase.length > 0;
  const passphraseOk = !passphraseFilled || passphrase.length >= 8;
  const matched = !passphraseFilled || passphrase === passphrase2;
  const canSubmit = selected.size > 0 && passphraseOk && matched && !submitting;

  const handleExport = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await api.exportConnections(
        Array.from(selected),
        passphrase
      );
      const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: res.encrypted ? 'application/octet-stream' : 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      const tag = res.encrypted ? '🔒 加密' : '⚠ 明文（含密码）';
      showToast(`✓ 已导出 ${res.count} 个连接（${tag}，${formatSize(res.size)}）`);
      onClose();
    } catch (e) {
      showToast('导出失败: ' + (e as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop show" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-export">
        <h3>导出连接</h3>
        <p className="modal-subtitle">
          包含全部字段（含密码）。passphrase 留空 → 明文 JSON；填 ≥ 8 位 → 加密文件
        </p>

        <div className="modal-export-body">
          <div className="export-block">
            <div className="export-block-label">
              <span>选择连接 <span className="count">{selected.size} / {list.length}</span></span>
              <div className="export-link-actions">
                <button type="button" onClick={selectAll} disabled={allSelected}>全选</button>
                <button type="button" onClick={selectNone} disabled={noneSelected}>全不选</button>
                <button type="button" onClick={invert}>反选</button>
              </div>
            </div>
            <div className="export-list">
              {list.map((c) => (
                <label
                  key={c.dbId}
                  className={'export-list-item' + (selected.has(c.dbId) ? ' checked' : '')}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c.dbId)}
                    onChange={() => toggle(c.dbId)}
                  />
                  <span className={'badge badge-' + c.type}>
                    {c.type === 'mysql' ? 'MySQL' : 'PG'}
                  </span>
                  <div className="export-list-text">
                    <span className="export-list-dbId">{c.dbId}</span>
                    <span className="export-list-meta">{c.user}@{c.host}:{c.port}/{c.database}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

            <div className="export-block">
              <div className="export-block-label">
                <span>加密 passphrase</span>
                <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>
                  选填 · 留空 = 明文 JSON，填 ≥ 8 位 = 加密
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
                <div className="export-field">
                  <span>输入</span>
                    <input
                      type={showPassphrase ? 'text' : 'password'}
                      value={passphrase}
                      placeholder="（留空则不加密）"
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
                  {passphrase && !passphraseOk && (
                    <span className="export-field-hint error">还差 {8 - passphrase.length} 位</span>
                  )}
                </div>
                <div className="export-field">
                  <span>确认</span>
                    <input
                      type={showPassphrase ? 'text' : 'password'}
                      value={passphrase2}
                      placeholder={passphrase ? '再输入一次' : '（无需确认）'}
                      autoComplete="new-password"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      data-form-type="other"
                      data-lpignore="true"
                      data-1pignore="true"
                      data-bwignore="true"
                      data-dashlane-ignore="true"
                      name="passphrase-confirm-no-autofill"
                      disabled={!passphrase}
                      onChange={(e) => setPassphrase2(e.target.value)}
                    />
                  {passphrase2 && !matched && (
                    <span className="export-field-hint error">两次输入不一致</span>
                  )}
                  {matched && passphrase && (
                    <span className="export-field-hint ok">✓ 一致</span>
                  )}
                </div>
              </div>
            </div>
        </div>

        <div className="modal-export-footer">
          <button type="button" className="ghost" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button
            type="button"
            className="primary"
            disabled={!canSubmit}
            onClick={handleExport}
          >
            {submitting ? '导出中...' : `导出 ${selected.size} 个连接`}
          </button>
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