import { type RefObject } from 'react';
import type { UsageEntry } from '../types.js';

interface Props {
  entry: UsageEntry | null;
  knownDbIds: string[];
  onSave: (title: string, content: string, dbId: string) => void;
  onCancel: () => void;
  saveBtnRef: RefObject<HTMLButtonElement>;
}

export function UsageEditor({ entry, knownDbIds, onSave, onCancel, saveBtnRef }: Props) {
  const isEdit = entry !== null;
  const title = isEdit ? `编辑用法 [${entry.index}]` : '新增用法';
  const mode = isEdit ? '编辑中' : '新增';

  const handleClick = () => {
    const root = saveBtnRef.current?.closest('.card');
    if (!root) return;
    const titleEl = root.querySelector<HTMLInputElement>('#usage-title');
    const contentEl = root.querySelector<HTMLTextAreaElement>('#usage-content');
    const dbIdEl = root.querySelector<HTMLSelectElement>('#usage-dbId');
    if (!titleEl || !contentEl || !dbIdEl) return;
    onSave(titleEl.value.trim(), contentEl.value.trim(), dbIdEl.value);
  };

  return (
    <>
      <div className="form-header">
        <h2>{title}</h2>
        <span className="form-mode">{mode}</span>
      </div>

      <div className="form-grid">
        <div className="field full">
          <label>dbId <span className="req">*</span></label>
          <select id="usage-dbId" defaultValue={entry?.dbId ?? ''}>
            <option value="">-- 选择 dbId --</option>
            {knownDbIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>
        <div className="field full">
          <label>标题 <span className="req">*</span></label>
          <input
            id="usage-title"
            placeholder="如：查询活跃用户 / 踩坑：online_id 大小写"
            defaultValue={entry?.title ?? ''}
          />
        </div>
        <div className="field full">
          <label>笔记内容 <span className="req">*</span></label>
          <textarea
            id="usage-content"
            className="code-input"
            rows={12}
            placeholder={'Markdown 格式的内容。\n\n例：查询最近 24h 活跃用户：\n\n```sql\nSELECT * FROM users ...\n```\n\n踩坑：online_id 字段在 PG 大小写敏感。'}
            defaultValue={entry?.content ?? ''}
          />
        </div>
      </div>

      <div className="actions">
        <button className="primary" ref={saveBtnRef} onClick={handleClick}>保存</button>
        <button className="ghost" onClick={onCancel}>取消</button>
      </div>
    </>
  );
}