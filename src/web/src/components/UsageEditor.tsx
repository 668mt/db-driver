import { type RefObject } from 'react';
import type { UsageEntry } from '../types.js';

interface Props {
  entry: UsageEntry | null;
  knownDbIds: string[];
  onSave: (title: string, content: string, dbIds: string[]) => void;
  onCancel: () => void;
  saveBtnRef: RefObject<HTMLButtonElement>;
}

export function UsageEditor({ entry, knownDbIds, onSave, onCancel, saveBtnRef }: Props) {
  const isEdit = entry !== null;
  const title = isEdit ? `编辑用法 [${entry.index}]` : '新增用法';
  const mode = isEdit ? '编辑中' : '新增';
  const initialDbIds = entry?.dbIds ?? [];

  const handleClick = () => {
    const root = saveBtnRef.current?.closest('.card');
    if (!root) return;
    const titleEl = root.querySelector<HTMLInputElement>('#usage-title');
    const contentEl = root.querySelector<HTMLTextAreaElement>('#usage-content');
    if (!titleEl || !contentEl) return;
    const checked = root.querySelectorAll<HTMLInputElement>('.dbId-multi-checkbox:checked');
    const dbIds = Array.from(checked).map((el) => el.value);
    onSave(titleEl.value.trim(), contentEl.value.trim(), dbIds);
  };

  return (
    <>
      <div className="form-header">
        <h2>{title}</h2>
        <span className="form-mode">{mode}</span>
      </div>

      <div className="form-grid">
        <div className="field full">
          <label>
            绑定的 dbId <span className="req">*</span>
            <span className="opt">（可多选，逗号分隔；同一套笔记可同时关联多套环境）</span>
          </label>
          <div className="dbId-multi">
            {knownDbIds.length === 0 ? (
              <div className="dbId-multi-empty">暂无可选 dbId，请先在"连接"页添加连接</div>
            ) : (
              knownDbIds.map((id) => (
                <label key={id} className="dbId-multi-item">
                  <input
                    type="checkbox"
                    className="dbId-multi-checkbox"
                    value={id}
                    defaultChecked={initialDbIds.includes(id)}
                  />
                  {id}
                </label>
              ))
            )}
          </div>
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