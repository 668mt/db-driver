import type { DbConnectionConfig } from '../types.js';

interface Props {
  list: DbConnectionConfig[];
  active: string | undefined;
  onSelect: (dbId: string) => void;
}

export function ConnectionList({ list, active, onSelect }: Props) {
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
            {c.dbId}
          </div>
          <div className="list-item-meta">{c.user}@{c.host}:{c.port}/{c.database}</div>
          {c.description ? <div className="list-item-desc">{c.description}</div> : null}
        </div>
      ))}
    </div>
  );
}