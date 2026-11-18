import { Injectable, signal } from '@angular/core';

export interface ToastItem {
  id: number;
  kind: 'success' | 'error' | 'info';
  message: string;
}

@Injectable({ providedIn: 'root' })
export class Toasts {
  private nextId = 1;
  readonly items = signal<ToastItem[]>([]);

  show(kind: ToastItem['kind'], message: string) {
    const id = this.nextId++;
    this.items.update((list) => [...list, { id, kind, message }]);
    const ttl = kind === 'error' ? 8000 : 4000;
    setTimeout(() => this.dismiss(id), ttl);
  }

  success(message: string) {
    this.show('success', message);
  }

  error(message: string) {
    this.show('error', message);
  }

  info(message: string) {
    this.show('info', message);
  }

  dismiss(id: number) {
    this.items.update((list) => list.filter((t) => t.id !== id));
  }
}
