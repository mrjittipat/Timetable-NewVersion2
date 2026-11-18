import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Confirm } from '../core/confirm';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (confirm.current(); as c) {
      <div class="confirm-scrim" (click)="cancel()">
        <div
          class="confirm-box"
          [class.danger]="c.danger"
          role="dialog"
          aria-modal="true"
          (click)="$event.stopPropagation()"
        >
          <h3>{{ c.title }}</h3>
          <p class="muted">{{ c.message }}</p>
          @if (c.inputLabel !== undefined) {
            <div class="field">
              <label>{{ c.inputLabel }}</label>
              <input class="input" [(ngModel)]="c.inputValue" (keydown.enter)="submit(c.inputValue ?? '')" autofocus />
            </div>
          }
          <div class="confirm-foot">
            <button type="button" class="btn" (click)="cancel()">{{ c.cancelLabel }}</button>
            <button
              type="button"
              class="btn"
              [class.danger]="c.danger"
              [class.primary]="!c.danger"
              (click)="submit(c.inputLabel !== undefined ? (c.inputValue ?? '') : true)"
            >
              {{ c.confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .confirm-scrim {
      position: fixed;
      inset: 0;
      z-index: 2000;
      background: rgba(34, 22, 26, 0.42);
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding: 16px;
    }
    .confirm-box {
      width: 100%;
      max-width: 460px;
      background: var(--surface);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      border: 1px solid var(--border);
      border-top: 4px solid var(--maroon-700);
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .confirm-box.danger {
      border-top-color: var(--danger);
    }
    .confirm-foot {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 4px;
    }
  `,
})
export class ConfirmDialog {
  readonly confirm = inject(Confirm);

  cancel() {
    const c = this.confirm.current();
    this.confirm.finish(c?.inputLabel !== undefined ? null : false);
  }

  submit(val: boolean | string) {
    this.confirm.finish(val);
  }
}
