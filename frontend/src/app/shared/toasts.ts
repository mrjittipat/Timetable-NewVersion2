import { Component, inject } from '@angular/core';
import { Toasts } from '../core/toast';
import { Icon } from './icon';

@Component({
  selector: 'app-toasts',
  standalone: true,
  imports: [Icon],
  template: `
    <div class="toast-stack" aria-live="polite">
      @for (t of toasts.items(); track t.id) {
        <div class="toast" [class]="t.kind">
          <span>{{ t.message }}</span>
          <button type="button" class="btn ghost sm icon" (click)="toasts.dismiss(t.id)" aria-label="ปิด">
            <app-icon name="x" [size]="15" />
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .toast-stack {
      position: fixed;
      right: 22px;
      bottom: 96px;
      z-index: 1500;
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-width: 380px;
    }
    .toast {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 11px 14px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-left: 4px solid var(--maroon-700);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      font-size: 13.5px;
    }
    .toast.success {
      border-left-color: var(--success);
    }
    .toast.error {
      border-left-color: var(--danger);
    }
  `,
})
export class ToastStack {
  readonly toasts = inject(Toasts);
}
