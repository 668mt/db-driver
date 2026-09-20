import { useEffect, useState } from 'react';
import { subscribeToast } from '../toast-bus.js';

export function Toast() {
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => subscribeToast(setToast), []);

  return (
    <div className={'toast show ' + (toast?.type ?? '')}>{toast?.msg ?? ''}</div>
  );
}