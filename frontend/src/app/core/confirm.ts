import { Injectable, signal } from '@angular/core';

export interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  inputLabel?: string;
  inputValue?: string;
  resolve: (val: boolean | string | null) => void;
}

@Injectable({ providedIn: 'root' })
export class Confirm {
  readonly current = signal<ConfirmState | null>(null);

  ask(opts: { title: string; message: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }): Promise<boolean> {
    return new Promise((resolve) => {
      this.current.set({
        title: opts.title,
        message: opts.message,
        confirmLabel: opts.confirmLabel || 'ยืนยัน',
        cancelLabel: opts.cancelLabel || 'ยกเลิก',
        danger: Boolean(opts.danger),
        resolve: (v) => resolve(Boolean(v)),
      });
    });
  }

  prompt(opts: {
    title: string;
    message: string;
    inputLabel?: string;
    defaultValue?: string;
    confirmLabel?: string;
    cancelLabel?: string;
  }): Promise<string | null> {
    return new Promise((resolve) => {
      this.current.set({
        title: opts.title,
        message: opts.message,
        inputLabel: opts.inputLabel || 'ชื่อ',
        inputValue: opts.defaultValue || '',
        confirmLabel: opts.confirmLabel || 'บันทึก',
        cancelLabel: opts.cancelLabel || 'ยกเลิก',
        danger: false,
        resolve: (v) => resolve(typeof v === 'string' ? v : null),
      });
    });
  }

  finish(result: boolean | string | null) {
    const cur = this.current();
    this.current.set(null);
    cur?.resolve(result);
  }
}
