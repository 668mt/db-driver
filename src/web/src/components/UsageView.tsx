import { useEffect, useState } from 'react';
import { api } from '../api.js';
import type { UsageEntry } from '../types.js';

interface Props {
  entry: UsageEntry;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function UsageView({ entry, onEdit, onDelete, onClose }: Props) {
  const [html, setHtml] = useState<string>('<p>加载中...</p>');

  useEffect(() => {
    let cancelled = false;
    api.renderMarkdown(entry.content)
      .then((res) => { if (!cancelled) setHtml(res.html); })
      .catch(() => { if (!cancelled) setHtml('<pre>' + escapeHtml(entry.content) + '</pre>'); });
    return () => { cancelled = true; };
  }, [entry.content]);

  return (
    <>
      <div className="form-header">
        <h2>查看用法 [{entry.index}]</h2>
        <span className="form-mode">查看</span>
      </div>

      <div className="usage-view-meta">
        <span className="usage-view-dbId">{entry.dbIds.join(', ')}</span>
        <span className="usage-view-time">{entry.addedAt}</span>
      </div>
      <h3 className="usage-view-title">{entry.title}</h3>
      <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />

      <div className="actions">
        <button className="primary" onClick={onEdit}>编辑</button>
        <button className="danger" onClick={onDelete}>删除</button>
        <button className="ghost" onClick={onClose}>关闭</button>
      </div>
    </>
  );
}

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
}