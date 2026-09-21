import { useState } from 'react';
import { api } from '../api.js';
import { showToast } from '../toast-bus.js';
import type { UsageEntry } from '../types.js';

interface Props {
  list: UsageEntry[];
  onClose: () => void;
}

export function UsageExportModal({ list, onClose }: Props) {
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(list.map((u) => u.index))
  );
  const [submitting, setSubmitting] = useState(false);

  const allSelected = selected.size === list.length;
  const noneSelected = selected.size === 0;
  const toggle = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(list.map((u) => u.index)));
  const selectNone = () => setSelected(new Set());
  const invert = () =>
    setSelected(new Set(list.filter((u) => !selected.has(u.index)).map((u) => u.index)));

  const handleExport = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    try {
      const res = await api.exportUsage(Array.from(selected));
      const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`✓ 已导出 ${res.count} 条笔记（${formatSize(res.size)}）`);
      onClose();
    } catch (e) {
      showToast('导出失败: ' + (e as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop show" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-import">
        <h3>导出笔记</h3>
        <p className="modal-subtitle">导出选中笔记为 JSON（明文 Markdown，含 dbIds），可分享或备份</p>

        <div className="modal-export-body">
          <div className="export-block">
            <div className="export-block-label">
              <span>选择笔记 <span className="count">{selected.size} / {list.length}</span></span>
              <div className="export-link-actions">
                <button type="button" onClick={selectAll} disabled={allSelected}>全选</button>
                <button type="button" onClick={selectNone} disabled={noneSelected}>全不选</button>
                <button type="button" onClick={invert}>反选</button>
              </div>
            </div>
            <div className="export-list">
              {list.map((u) => (
                <label
                  key={u.index}
                  className={'export-list-item' + (selected.has(u.index) ? ' checked' : '')}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(u.index)}
                    onChange={() => toggle(u.index)}
                  />
                  <span className="list-item-dbId-static">[{u.index}]</span>
                  <div className="export-list-text">
                    <span className="export-list-dbId">{u.title}</span>
                    <span className="export-list-meta">{u.dbIds.join(', ')}</span>
                  </div>
                </label>
              ))}
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
            disabled={selected.size === 0 || submitting}
            onClick={handleExport}
          >
            {submitting ? '导出中...' : `导出 ${selected.size} 条笔记`}
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