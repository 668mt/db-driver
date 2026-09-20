import type { UsageEntry } from '../types.js';

interface Props {
  list: UsageEntry[];
  active: number | undefined;
  filterDesc: string;
  onSelect: (entry: UsageEntry) => void;
}

export function UsageList({ list, active, filterDesc, onSelect }: Props) {
  if (list.length === 0) {
    return <div className="empty-list">还没有{filterDesc ? ' ' + filterDesc + ' 的' : ''}用法<br />点击上方 + 新增</div>;
  }
  return (
    <div className="list">
      {list.map((u) => {
        const firstLine = u.content.split('\n')[0];
        const preview = firstLine.length > 80 ? firstLine.slice(0, 80) + '…' : firstLine;
        return (
          <div
            key={u.index}
            className={'list-item' + (active === u.index ? ' active' : '')}
            onClick={() => onSelect(u)}
          >
            <div className="list-item-title">[{u.index}] {u.dbId}</div>
            <div className="list-item-meta">{u.addedAt}</div>
            <div className="list-item-desc">{preview}</div>
          </div>
        );
      })}
    </div>
  );
}