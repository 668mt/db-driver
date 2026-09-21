import type { Tab } from '../types.js';

interface Props {
  version: string;
  activeTab: Tab;
  onSwitchTab: (t: Tab) => void;
}

export function Header({ version, activeTab, onSwitchTab }: Props) {
  return (
    <header className="header">
      <div className="brand">
        <div className="brand-mark">
          <svg viewBox="0 0 32 32" width="22" height="22" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="14" cy="8" rx="9" ry="3" />
            <path d="M5 8v7c0 1.7 4 3 9 3s9-1.3 9-3V8" />
            <path d="M5 15v7c0 1.7 4 3 9 3s9-1.3 9-3v-7" />
            <rect x="22" y="22" width="8" height="6" rx="1.2" fill="white" stroke="none" />
            <path d="M23.5 22v-1.6a2.5 2.5 0 0 1 5 0V22" />
            <circle cx="26" cy="25" r="0.8" fill="#3b82f6" stroke="none" />
          </svg>
        </div>
        <div className="brand-text">
          <h1>db-driver 控制台</h1>
          <p>连接配置 + SQL 用法笔记 · 本地加密存储</p>
        </div>
      </div>
      <div className="header-tabs">
        <button
          type="button"
          className={'header-tab' + (activeTab === 'connections' ? ' active' : '')}
          onClick={() => onSwitchTab('connections')}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M3 5v6c0 1.7 4 3 9 3s9-1.3 9-3V5" />
            <path d="M3 11v6c0 1.7 4 3 9 3s9-1.3 9-3v-6" />
          </svg>
          连接
        </button>
        <button
          type="button"
          className={'header-tab' + (activeTab === 'usage' ? ' active' : '')}
          onClick={() => onSwitchTab('usage')}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="9" y1="13" x2="15" y2="13" />
            <line x1="9" y1="17" x2="15" y2="17" />
          </svg>
          笔记
        </button>
      </div>
      <div className="header-meta">
        <code>v{version}</code>
      </div>
    </header>
  );
}