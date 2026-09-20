export interface ToastState {
  msg: string;
  type: 'success' | 'error';
}

let toastListeners: Array<(t: ToastState | null) => void> = [];
let currentToast: ToastState | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function showToast(msg: string, type: 'success' | 'error' = 'success'): void {
  currentToast = { msg, type };
  toastListeners.forEach((cb) => cb(currentToast));
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    currentToast = null;
    toastListeners.forEach((cb) => cb(null));
  }, 2400);
}

export function subscribeToast(cb: (t: ToastState | null) => void): () => void {
  toastListeners.push(cb);
  cb(currentToast);
  return () => {
    toastListeners = toastListeners.filter((l) => l !== cb);
  };
}