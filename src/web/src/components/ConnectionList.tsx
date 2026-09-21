import type { ConnectionState } from '../hooks/useConnections.js';

interface Props {
  list: ConnectionState[];
  active: string | undefined;
  onSelect: (dbId: string) => void;
  onDuplicate: (dbId: string) => void;
  onRetest: (dbId: string) => void;
}

export function ConnectionList({ list, active, onSelect, onDuplicate, onRetest }: Props) {
  if (list.length === 0) {
    return <div className="empty-list">还没有连接<br />点击上方 + 新建连接</div>;
  }
  return (
    <div className="list">
      {list.map((c) => (
        <div
          key={c.dbId}
          className={'list-item' + (active === c.dbId ? ' active' : '')}
          onClick={() => onSelect(c.dbId)}
        >
          <div className="list-item-title">
            <span className={'badge badge-' + c.type}>
              {c.type === 'mysql' ? 'MySQL' : 'PG'}
            </span>
            <span className="list-item-dbId">{c.dbId}</span>
            <TestStatusBadge
              status={c.testStatus}
              error={c.testError}
              onRetest={(e) => {
                e.stopPropagation();
                onRetest(c.dbId);
              }}
            />
            <button
              type="button"
              className="list-item-action"
              title="复制为新连接（不保存，进入编辑）"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate(c.dbId);
              }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          </div>
          <div className="list-item-meta">{c.user}@{c.host}:{c.port}/{c.database}</div>
          <PermissionChips perms={c.permissions} />
          {c.description ? <div className="list-item-desc">{c.description}</div> : null}
        </div>
      ))}
    </div>
  );
}

function TestStatusBadge({
  status,
  error,
  onRetest,
}: {
  status: ConnectionState['testStatus'];
  error?: string;
  onRetest: (e: React.MouseEvent) => void;
}) {
  if (status === 'unknown') {
    return (
      <span
        className="test-badge test-unknown"
        title="未测试 · 点击重测"
        onClick={onRetest}
      >
        ○
      </span>
    );
  }
  if (status === 'testing') {
    return (
      <span className="test-badge test-testing" title="测试中...">
        <span className="spinner-dot" />
      </span>
    );
  }
  if (status === 'ok') {
    return (
      <span
        className="test-badge test-ok"
        title="连接通过 · 点击重测"
        onClick={onRetest}
      >
        ✓
      </span>
    );
  }
  return (
    <span
      className="test-badge test-failed"
      title={(error || '连接失败') + ' · 点击重测'}
      onClick={onRetest}
    >
      ✗
    </span>
  );
}

function PermissionChips({ perms }: { perms: ConnectionState['permissions'] }) {
  const items: Array<{ key: keyof typeof perms; label: string }> = [
    { key: 'dmlQuery', label: 'Q' },
    { key: 'dmlUpdate', label: 'U' },
    { key: 'dmlDelete', label: 'D' },
    { key: 'ddl', label: 'DDL' },
  ];
  return (
    <div className="perm-chips">
      {items.map((it) => (
        <span
          key={it.key}
          className={'perm-chip ' + (perms[it.key] ? 'on' : 'off')}
          title={
            it.key === 'dmlQuery'
              ? 'SELECT'
              : it.key === 'dmlUpdate'
                ? 'INSERT/UPDATE'
                : it.key === 'dmlDelete'
                  ? 'DELETE'
                  : 'CREATE/ALTER/DROP'
          }
        >
          {it.label}
        </span>
      ))}
    </div>
  );
}