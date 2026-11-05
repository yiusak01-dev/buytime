/**
 * 首頁「影收據」：影完相即刻轉去出 post 頁，張相經呢度交過去（只喺記憶體，唔會儲存或者上載）。
 */
let pending: File | null = null;

export function setPendingPhoto(file: File | null) {
  pending = file;
}

/** 攞走張相（攞完就清空，避免返嚟又再讀多次） */
export function takePendingPhoto(): File | null {
  const f = pending;
  pending = null;
  return f;
}
