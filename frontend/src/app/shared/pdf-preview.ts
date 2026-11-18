import { Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { Icon } from './icon';

@Component({
  selector: 'app-pdf-preview',
  standalone: true,
  imports: [Icon],
  template: `
    @if (url(); as raw) {
      <div class="scrim" (click)="closed.emit()">
        <div class="pdf-modal" (click)="$event.stopPropagation()">
          <div class="dialog-head">
            <div class="row">
              <app-icon name="file" />
              <h3>ตัวอย่างเอกสาร PDF</h3>
            </div>
            <div class="row">
              <button type="button" class="btn" (click)="printFrame()">
                <app-icon name="file" [size]="16" />
                พิมพ์
              </button>
              <a class="btn primary" [href]="downloadUrl()" target="_blank" download>
                <app-icon name="download" [size]="16" />
                ดาวน์โหลด PDF
              </a>
              <button type="button" class="btn icon" (click)="closed.emit()" aria-label="ปิด">
                <app-icon name="x" [size]="18" />
              </button>
            </div>
          </div>
          <div class="pdf-body">
            @if (loading()) {
              <div class="pdf-loading">
                <span class="spinner"></span>
                <span>กำลังสร้างเอกสาร…</span>
              </div>
            }
            <iframe #frame [src]="safeUrl()" (load)="loading.set(false)" title="ตัวอย่าง PDF"></iframe>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .pdf-modal {
      width: 100%;
      max-width: 1180px;
      height: 92vh;
      background: var(--surface);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .pdf-body {
      position: relative;
      flex: 1 1 auto;
      background: #e9e4e5;
    }
    .pdf-loading {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      color: var(--text-muted);
      background: rgba(255, 255, 255, 0.85);
    }
    iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
  `,
})
export class PdfPreview {
  private readonly sanitizer = inject(DomSanitizer);
  readonly url = input<string | null>(null);
  readonly closed = output<void>();
  readonly loading = signal(true);
  readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('frame');

  readonly safeUrl = computed(() => {
    const u = this.url();
    this.loading.set(true);
    return u ? this.sanitizer.bypassSecurityTrustResourceUrl(u) : null;
  });

  readonly downloadUrl = computed(() => {
    const u = this.url() || '';
    return u.replace(/([?&])inline=1(&?)/, (_m, p1, p2) => (p2 ? p1 : '')).replace(/[?&]$/, '');
  });

  printFrame() {
    this.frame()?.nativeElement?.contentWindow?.print();
  }
}
