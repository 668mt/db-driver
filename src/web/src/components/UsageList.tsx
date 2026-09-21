import type { UsageEntry } from '../types.js';

interface Props {
  list: UsageEntry[];
  total: number;
  hasMore: boolean;
  onLoadMore: () => void;
  active: number | undefined;
  filterDesc: string;
  onSelect: (entry: UsageEntry) => void;
}

export function UsageList({ list, total, hasMore, onLoadMore, active, filterDesc, onSelect }: Props) {
  if (list.length === 0) {
    return <div className="empty-list">还没有{filterDesc ? ' ' + filterDesc + ' 的' : ''}用法<br />点击上方 + 新增</div>;
  }
  return (
    <div className="list">
      {list.map((u) => {
        const firstLine = u.content.split('\n')[0].trim();
        const tooltip = firstLine.length > 200 ? firstLine.slice(0, 200) + '…' : firstLine;
        const dbStr = u.dbIds.join(', ');
        return (
          <div
            key={u.index}
            className={'list-item' + (active === u.index ? ' active' : '')}
            title={tooltip || undefined}
            onClick={() => onSelect(u)}
          >
            <div className="list-item-title">[{u.index}] {u.title}</div>
            <div className="list-item-meta">{dbStr} · {u.addedAt}</div>
          </div>
        );
      })}
      {hasMore && (
        <div className="list-load-more">
          <button type="button" className="ghost" onClick={onLoadMore}>
            加载更多（剩余 {total - list.length} 条）
          </button>
        </div>
      )}
    </div>
  );
}