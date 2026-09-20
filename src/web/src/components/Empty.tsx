interface Props {
  icon?: string;
  title: string;
  hint?: string;
}

export function Empty({ icon = '⬅', title, hint }: Props) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      {hint ? <div className="empty-hint">{hint}</div> : null}
    </div>
  );
}