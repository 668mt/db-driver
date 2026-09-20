import { useEffect, useState } from 'react';
import { subscribeModal, hideModal, type ModalState } from '../modal-bus.js';

export function Modal() {
  const [state, setState] = useState<ModalState>(null);

  useEffect(() => subscribeModal(setState), []);

  if (!state) {
    return (
      <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && hideModal()} />
    );
  }

  return (
    <div className="modal-backdrop show" onClick={(e) => e.target === e.currentTarget && hideModal()}>
      <div className="modal">
        <h3>{state.title}</h3>
        <p>{state.text}</p>
        <div className="modal-actions">
          <button className="ghost" onClick={hideModal}>取消</button>
          <button
            className={state.danger === false ? 'primary' : 'danger'}
            onClick={() => {
              const cb = state.onConfirm;
              hideModal();
              cb();
            }}
          >
            {state.confirmText ?? '删除'}
          </button>
        </div>
      </div>
    </div>
  );
}