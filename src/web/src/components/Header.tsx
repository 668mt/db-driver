interface Props {
  version: string;
}

export function Header({ version }: Props) {
  return (
    <header className="header">
      <div className="brand">
        <div className="brand-mark">🗄</div>
        <div className="brand-text">
          <h1>db-driver 控制台</h1>
          <p>连接配置 + SQL 用法笔记 · 本地加密存储</p>
        </div>
      </div>
      <div className="header-meta">
        <code>v{version}</code>
      </div>
    </header>
  );
}