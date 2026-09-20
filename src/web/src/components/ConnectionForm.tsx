import { useState, type RefObject } from 'react';
import { PasswordField } from './PasswordField.js';
import type { DbConnectionConfig } from '../types.js';

interface Props {
  draft: DbConnectionConfig;
  onChange: (next: DbConnectionConfig) => void;
  onSave: () => void;
  onTest: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  saveBtnRef: RefObject<HTMLButtonElement>;
}

export function ConnectionForm({
  draft, onChange, onSave, onTest, onCancel, onDelete, saveBtnRef,
}: Props) {
  const update = <K extends keyof DbConnectionConfig>(key: K, value: DbConnectionConfig[K]) => {
    onChange({ ...draft, [key]: value });
  };

  const updatePerm = (key: keyof DbConnectionConfig['permissions'], value: boolean) => {
    onChange({ ...draft, permissions: { ...draft.permissions, [key]: value } });
  };

  const isEdit = Boolean(draft.createdAt);
  const title = isEdit ? `编辑 ${draft.dbId}` : '新建连接';
  const mode = isEdit ? '编辑中' : '新建';

  return (
    <>
      <div className="form-header">
        <h2>{title}</h2>
        <span className="form-mode">{mode}</span>
      </div>

      <div className="form-grid">
        <div className="field">
          <label>dbId <span className="req">*</span></label>
          <input
            id="dbId"
            value={draft.dbId}
            disabled={isEdit}
            placeholder="例如 my-app-db"
            onChange={(e) => update('dbId', e.target.value)}
          />
        </div>
        <div className="field">
          <label>类型 <span className="req">*</span></label>
          <select value={draft.type} onChange={(e) => update('type', e.target.value as DbConnectionConfig['type'])}>
            <option value="mysql">MySQL</option>
            <option value="postgres">PostgreSQL</option>
          </select>
        </div>
        <div className="field">
          <label>Host <span className="req">*</span></label>
          <input value={draft.host} placeholder="127.0.0.1" onChange={(e) => update('host', e.target.value)} />
        </div>
        <div className="field">
          <label>Port <span className="req">*</span></label>
          <input
            type="number"
            value={draft.port}
            placeholder="3306 / 5432"
            onChange={(e) => update('port', parseInt(e.target.value, 10) || 3306)}
          />
        </div>
        <div className="field">
          <label>User <span className="req">*</span></label>
          <input value={draft.user} placeholder="root" onChange={(e) => update('user', e.target.value)} />
        </div>
        <div className="field">
          <label>Password <span className="req">*</span></label>
          <PasswordField
            value={draft.password}
            onChange={(v) => update('password', v)}
          />
        </div>
        <div className="field full">
          <label>Database <span className="req">*</span></label>
          <input value={draft.database} placeholder="数据库名（catalog）" onChange={(e) => update('database', e.target.value)} />
        </div>
        {draft.type === 'postgres' ? (
          <div className="field full">
            <label>Schema <span className="opt">（可选，仅 PostgreSQL）</span></label>
            <input value={draft.schema ?? ''} placeholder="PostgreSQL 用，默认 public" onChange={(e) => update('schema', e.target.value || undefined)} />
          </div>
        ) : null}
        <div className="field full">
          <label>描述 <span className="opt">（可选，便于区分多套同形环境）</span></label>
          <textarea
            rows={2}
            value={draft.description ?? ''}
            placeholder="如：生产 / 预发 / 测试"
            onChange={(e) => update('description', e.target.value || undefined)}
          />
        </div>
      </div>

      <div className="section-title">权限</div>
      <div className="permissions">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.permissions.dmlQuery}
            onChange={(e) => updatePerm('dmlQuery', e.target.checked)}
          />
          <div className="checkbox-label">SELECT<span className="checkbox-desc">只读查询</span></div>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.permissions.dmlUpdate}
            onChange={(e) => updatePerm('dmlUpdate', e.target.checked)}
          />
          <div className="checkbox-label">INSERT / UPDATE<span className="checkbox-desc">新增和修改</span></div>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.permissions.dmlDelete}
            onChange={(e) => updatePerm('dmlDelete', e.target.checked)}
          />
          <div className="checkbox-label">DELETE<span className="checkbox-desc">删除数据</span></div>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.permissions.ddl}
            onChange={(e) => updatePerm('ddl', e.target.checked)}
          />
          <div className="checkbox-label">DDL<span className="checkbox-desc">建表、改表、删表</span></div>
        </label>
      </div>

      <div className="actions">
        <button className="primary" ref={saveBtnRef} onClick={onSave}>保存</button>
        <button onClick={onTest}>测试连接</button>
        {onDelete ? <button className="danger" onClick={onDelete}>删除</button> : null}
        <button className="ghost" onClick={onCancel}>取消</button>
      </div>
    </>
  );
}