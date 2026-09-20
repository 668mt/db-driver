import type { Tab } from '../types.js';

interface Props {
  active: Tab;
  onChange: (tab: Tab) => void;
}

export function Tabs({ active, onChange }: Props) {
  return (
    <div className="tabs">
      <button
        className={'tab' + (active === 'connections' ? ' active' : '')}
        onClick={() => onChange('connections')}
      >
        📚 连接配置
      </button>
      <button
        className={'tab' + (active === 'usage' ? ' active' : '')}
        onClick={() => onChange('usage')}
      >
        💡 用法笔记
      </button>
    </div>
  );
}