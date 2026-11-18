import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-avatar',
  standalone: true,
  template: `
    @if (src()) {
      <img [src]="src()" [alt]="name()" [style.width.px]="size()" [style.height.px]="size()" />
    } @else {
      <span class="fallback" [style.width.px]="size()" [style.height.px]="size()" [style.font-size.px]="fontSize()">
        {{ initial() }}
      </span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    img,
    .fallback {
      border-radius: 50%;
      object-fit: cover;
    }
    .fallback {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--maroon-700);
      color: #fff;
      font-weight: 700;
      border: 2px solid var(--maroon-200);
    }
  `,
})
export class Avatar {
  readonly src = input<string>('');
  readonly name = input<string>('U');
  readonly size = input(32);
  readonly initial = computed(() => (this.name().trim() || 'U').slice(0, 1).toUpperCase());
  readonly fontSize = computed(() => Math.max(12, Math.round(this.size() * 0.42)));
}
