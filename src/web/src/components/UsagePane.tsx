import { useEffect, useRef, useState, type RefObject } from 'react';
import { api } from '../api.js';
import { useUsages } from '../hooks/useUsages.js';
import { showToast } from '../toast-bus.js';
import { UsageList } from './UsageList.js';
import { UsageView } from './UsageView.js';
import { UsageEditor } from './UsageEditor.js';
import { Empty } from './Empty.js';
import type { UsageEntry } from '../types.js';

export function UsagePane() {
  const [filterDbId, setFilterDbId] = useState('');
  const [search, setSearch] = useState('');
  const [current, setCurrent] = useState<UsageEntry | null>(null);
  const [editing, setEditing] = useState(false);
  const [knownDbIds, setKnownDbIds] = useState<string[]>([]);
  const saveBtnRef = useRef<HTMLButtonElement>(null);

  const { list, reload } = useUsages(filterDbId, search, true, current !== null);

  useEffect(() => {
    const connIds: string[] = [];
    fetch('/api/connections')
      .then((r) => r.json())
      .then((list: { dbId: string; type: string }[]) => {
        for (const c of list) connIds.push(c.dbId);
        return list;
      })
      .catch(() => [])
      .finally(() => {
        const usageIds = list.map((u) => u.dbId);
        const set = new Set([...connIds, ...usageIds]);
        setKnownDbIds(Array.from(set));
      });
  }, [list]);

  const handleSelect = (entry: UsageEntry) => {
    setCurrent(entry);
    setEditing(false);
  };

  const handleNew = () => {
    setCurrent(null);
    setEditing(true);
  };

  const handleEdit = () => {
    if (current) setEditing(true);
  };

  const handleClose = () => {
    setCurrent(null);
    setEditing(false);
  };

  const handleSave = async (title: string, content: string, dbId: string) => {
    if (saveBtnRef.current) {
      saveBtnRef.current.disabled = true;
      const orig = saveBtnRef.current.textContent ?? '保存';
      saveBtnRef.current.innerHTML = '<span class="spinner"></span>保存中...';
      try {
        if (!dbId) { showToast('请选择 dbId', 'error'); return; }
        if (!title) { showToast('标题不能为空', 'error'); return; }
        if (!content) { showToast('笔记内容不能为空', 'error'); return; }
        const saved = current
          ? await api.updateUsage(current.index, title, content, dbId)
          : await api.saveUsage(title, content, dbId);
        setCurrent(saved);
        setEditing(false);
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

  const handleDelete = () => {
    if (!current) return;
    void (async () => {
      try {
        await api.deleteUsage(current.index);
        showToast('✓ 已删除');
        setCurrent(null);
        setEditing(false);
        await reload();
      } catch (e) {
        showToast('删除失败: ' + (e as Error).message, 'error');
      }
    })();
  };

  return (
    <>
      <aside className="card sidebar" data-anim-delay="0">
        <div className="sidebar-header">
          <h2>用法列表</h2>
          <div className="filter-bar">
            <label>dbId</label>
            <select value={filterDbId} onChange={(e) => setFilterDbId(e.target.value)}>
              <option value="">全部库</option>
              {knownDbIds.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          </div>
          <div className="search-bar">
            <input
              type="search"
              placeholder="搜索内容（不区分大小写）"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="new-btn" onClick={handleNew}>+ 新增用法</button>
        </div>
        <div className="sidebar-content">
          <UsageList list={list} active={current?.index} filterDesc={filterDbId} onSelect={handleSelect} />
        </div>
      </aside>

      <main className="card" data-anim-delay="60">
        {current && !editing ? (
          <UsageView entry={current} onEdit={handleEdit} onDelete={handleDelete} onClose={handleClose} />
        ) : current && editing ? (
          <UsageEditor
            entry={current}
            knownDbIds={knownDbIds}
            onSave={handleSave}
            onCancel={() => setEditing(false)}
            saveBtnRef={saveBtnRef as RefObject<HTMLButtonElement>}
          />
        ) : editing ? (
          <UsageEditor
            entry={null}
            knownDbIds={knownDbIds}
            onSave={handleSave}
            onCancel={handleClose}
            saveBtnRef={saveBtnRef as RefObject<HTMLButtonElement>}
          />
        ) : (
          <Empty icon="⬅" title="从左侧选择或新增用法" hint="SQL 用法以明文 Markdown 存储，便于人工查看和编辑" />
        )}
      </main>
    </>
  );
}