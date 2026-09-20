import { useEffect, useState, type ReactElement } from 'react';
import { Tabs } from './components/Tabs.js';
import { Header } from './components/Header.js';
import { Toast } from './components/Toast.js';
import { Modal } from './components/Modal.js';
import { ConnectionsPane } from './components/ConnectionsPane.js';
import { UsagePane } from './components/UsagePane.js';
import type { Tab } from './types.js';

function readVersion(): string {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="version"]');
  return meta?.content || '0.0.0';
}

export function App(): ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>('connections');
  const [version, setVersion] = useState<string>(readVersion());

  useEffect(() => {
    setVersion(readVersion());
  }, []);

  return (
    <div className="app">
      <Header version={version} />
      <Tabs active={activeTab} onChange={setActiveTab} />
      <div className="layout">
        {activeTab === 'connections' ? <ConnectionsPane /> : <UsagePane />}
      </div>
      <Toast />
      <Modal />
    </div>
  );
}