import { useRef, useState, type RefObject } from 'react';
import { api } from '../api.js';
import { useConnections } from '../hooks/useConnections.js';
import { showToast } from '../toast-bus.js';
import { showModal } from '../modal-bus.js';
import { ConnectionList } from './ConnectionList.js';
import { ConnectionForm } from './ConnectionForm.js';
import { Empty } from './Empty.js';
import type { DbConnectionConfig } from '../types.js';

const EMPTY_CONN: Omit<DbConnectionConfig, 'createdAt' | 'updatedAt'> = {
  dbId: '',
  type: 'mysql',
  host: '',
  port: 3306,
  user: '',
  password: '',
  database: '',
  permissions: { dmlQuery: true, dmlUpdate: false, dmlDelete: false, ddl: false },
};

export function ConnectionsPane() {
  const { list, reload } = useConnections();
  const [current, setCurrent] = useState<DbConnectionConfig | null>(null);
  const [draft, setDraft] = useState<DbConnectionConfig | null>(null);
  const saveBtnRef = useRef<HTMLButtonElement>(null);

  const handleNew = () => {
    setCurrent(null);
    setDraft({ ...EMPTY_CONN, createdAt: '', updatedAt: '' });
  };

  const handleSelect = async (dbId: string) => {
    try {
      const conn = await api.getConnection(dbId);
      setCurrent(conn);
      setDraft(conn);
    } catch (e) {
      showToast('未找到', 'error');
    }
  };

  const handleClose = () => {
    setCurrent(null);
    setDraft(null);
  };

  const handleSave = async () => {
    if (!draft) return;
    if (saveBtnRef.current) {
      saveBtnRef.current.disabled = true;
      const orig = saveBtnRef.current.textContent ?? '保存';
      saveBtnRef.current.innerHTML = '<span class="spinner"></span>保存中...';
      try {
        const saved = await api.saveConnection(draft);
        setCurrent(saved);
        setDraft(saved);
        showToast('✓ 已保存');
        await reload();
      } catch (e) {
        showToast('保存失败: ' + (e as Error).message, 'error');
      } finally {
        if (saveBtnRef.current) {
          saveBtnRef.current.disabled = false;
          saveBtnRef.current.textContent = orig;
        }
      }
    }
  };

  const handleTest = async () => {
    if (!draft) return;
    try {
      const res = await api.testConnection(draft);
      if (res.ok) showToast('✓ 连接成功', 'success');
      else showToast('✗ 连接失败: ' + res.error, 'error');
    } catch (e) {
      showToast('✗ 连接失败: ' + (e as Error).message, 'error');
    }
  };

  const handleDelete = () => {
    if (!current) return;
    showModal({
      title: '确认删除',
      text: `确定要删除连接 "${current.dbId}" 吗？此操作不可撤销。`,
      danger: true,
      onConfirm: async () => {
        try {
          await api.deleteConnection(current.dbId);
          showToast('已删除');
          setCurrent(null);
          setDraft(null);
          await reload();
        } catch (e) {
          showToast('删除失败', 'error');
        }
      },
    });
  };

  return (
    <>
      <aside className="card sidebar" data-anim-delay="0">
        <h2>连接列表</h2>
        <button className="new-btn" onClick={handleNew}>+ 新建连接</button>
        <ConnectionList list={list} active={current?.dbId} onSelect={handleSelect} />
      </aside>

      <main className="card" data-anim-delay="60">
        {draft ? (
          <ConnectionForm
            draft={draft}
            onChange={setDraft}
            onSave={handleSave}
            onTest={handleTest}
            onCancel={handleClose}
            onDelete={current ? handleDelete : undefined}
            saveBtnRef={saveBtnRef as RefObject<HTMLButtonElement>}
          />
        ) : (
          <Empty icon="⬅" title="从左侧选择或新建连接" hint="所有配置以加密二进制存于 OS keyring" />
        )}
      </main>
    </>
  );
}