export type ModalState = {
  title: string;
  text: string;
  onConfirm: () => void;
  confirmText?: string;
  danger?: boolean;
} | null;

let modalListeners: Array<(s: ModalState) => void> = [];
let currentModal: ModalState = null;

export function showModal(state: ModalState): void {
  currentModal = state;
  modalListeners.forEach((cb) => cb(currentModal));
}

export function hideModal(): void {
  currentModal = null;
  modalListeners.forEach((cb) => cb(currentModal));
}

export function subscribeModal(cb: (s: ModalState) => void): () => void {
  modalListeners.push(cb);
  cb(currentModal);
  return () => {
    modalListeners = modalListeners.filter((l) => l !== cb);
  };
}