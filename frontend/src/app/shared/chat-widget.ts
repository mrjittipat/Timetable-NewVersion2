import { Component, ElementRef, HostListener, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth';
import { ChatService } from '../core/chat';
import { ChatAction, ChatCard } from '../core/models';
import { Icon } from './icon';
import { PdfPreview } from './pdf-preview';

interface TextSegment {
  text: string;
  bold: boolean;
}

@Component({
  selector: 'app-chat-widget',
  standalone: true,
  imports: [FormsModule, RouterLink, Icon, PdfPreview],
  template: `
    @if (chat.open()) {
      <section class="chat-panel" aria-label="ผู้ช่วยจัดตาราง">
        <header class="chat-head">
          <div class="row">
            <span class="bot-tile"><app-icon name="bot" [size]="20" /></span>
            <div>
              <strong>ผู้ช่วยจัดตาราง</strong>
              <div class="status-line"><span class="dot"></span>ออฟไลน์ · ตอบทันที</div>
            </div>
          </div>
          <div class="row">
            <button type="button" class="btn ghost sm icon" title="ล้างแชท" (click)="chat.clear()">
              <app-icon name="trash" [size]="16" />
            </button>
            <button type="button" class="btn ghost sm icon" title="ย่อหน้าต่าง" (click)="chat.close()">
              <app-icon name="minus" [size]="18" />
            </button>
          </div>
        </header>

        <div class="chat-body" #scrollArea>
          @if (chat.messages().length === 0) {
            <div class="chat-welcome">
              <p>สวัสดีครับ! ถามข้อมูลตาราง ตรวจเงื่อนไข หรือสั่งจัดตารางได้เลยครับ</p>
              <div class="chips">
                @for (q of quickStarters; track q) {
                  <button type="button" class="chip" (click)="chat.send(q)">{{ q }}</button>
                }
              </div>
            </div>
          }

          @for (m of chat.messages(); track m.id) {
            <div class="msg" [class.user]="m.from === 'user'" [class.bot]="m.from === 'bot'">
              <div class="bubble">
                @for (line of splitLines(m.text); track $index) {
                  <p>
                    @for (seg of parseBold(line); track $index) {
                      @if (seg.bold) {
                        <strong>{{ seg.text }}</strong>
                      } @else {
                        <span>{{ seg.text }}</span>
                      }
                    }
                  </p>
                }
              </div>

              @if (m.cards?.length) {
                <div class="cards">
                  @for (card of m.cards; track $index; let cIdx = $index) {
                    @switch (card.type) {
                      @case ('table') {
                        <div class="c-card">
                          @if (card.title) {
                            <div class="c-title">{{ card.title }}</div>
                          }
                          <div class="c-table-wrap">
                            <table>
                              <thead>
                                <tr>
                                  @for (col of card.columns || []; track $index) {
                                    <th>{{ col }}</th>
                                  }
                                </tr>
                              </thead>
                              <tbody>
                                @for (r of card.rows || []; track $index) {
                                  <tr>
                                    @for (cell of r; track $index) {
                                      <td>{{ cell }}</td>
                                    }
                                  </tr>
                                }
                              </tbody>
                            </table>
                          </div>
                          @if (card.link; as lnk) {
                            <a class="c-link" [routerLink]="lnk.path" (click)="chat.close()">{{ lnk.label }} →</a>
                          }
                        </div>
                      }
                      @case ('list') {
                        <div class="c-card">
                          @if (card.title) {
                            <div class="c-title">{{ card.title }}</div>
                          }
                          <div class="c-list">
                            @for (item of card.items || []; track $index) {
                              @if (card.ask && isString(item)) {
                                <button type="button" class="ask-item" (click)="chat.send(asString(item))">{{ item }}</button>
                              } @else {
                                <div class="plain-item">{{ isString(item) ? item : item.label }}</div>
                              }
                            }
                          </div>
                        </div>
                      }
                      @case ('buttons') {
                        <div class="chips">
                          @for (it of card.items || []; track $index) {
                            @if (!isString(it)) {
                              <button type="button" class="btn sm" (click)="chat.runButtonAction(it.action)">
                                {{ it.label }}
                              </button>
                            }
                          }
                        </div>
                      }
                      @case ('action') {
                        <div class="c-card action-card" [class.danger]="card.action?.danger">
                          <div class="c-title">{{ card.title }}</div>
                          @for (ln of card.lines || []; track $index) {
                            <div class="small muted">{{ ln }}</div>
                          }
                          <div class="action-foot">
                            @if (!auth.isAdmin()) {
                              <span class="badge neutral">เฉพาะผู้ดูแลระบบ</span>
                            } @else if (card.status === 'running') {
                              <span class="row small"><span class="spinner"></span>กำลังทำงาน…</span>
                            } @else if (card.status === 'done') {
                              <span class="badge success">{{ card.resultText || 'ดำเนินการสำเร็จ' }}</span>
                            } @else if (card.status === 'error') {
                              <span class="badge danger">{{ card.resultText || 'เกิดข้อผิดพลาด' }}</span>
                            } @else {
                              <button
                                type="button"
                                class="btn sm"
                                [class.danger]="card.action?.danger"
                                [class.primary]="!card.action?.danger"
                                (click)="chat.confirmCard(m.id, cIdx)"
                              >
                                {{ card.action?.label || 'ยืนยัน' }}
                              </button>
                            }
                          </div>
                        </div>
                      }
                    }
                  }
                </div>
              }

              @if (m.suggestions?.length && m === chat.messages().at(-1)) {
                <div class="chips">
                  @for (s of m.suggestions; track s) {
                    <button type="button" class="chip" (click)="chat.send(s)">{{ s }}</button>
                  }
                </div>
              }
              <div class="time">{{ m.time }}</div>
            </div>
          }

          @if (chat.busy()) {
            <div class="msg bot">
              <div class="bubble typing"><span></span><span></span><span></span></div>
            </div>
          }
        </div>

        <form class="chat-foot" (submit)="onSubmit($event)">
          <textarea
            [(ngModel)]="draft"
            name="draft"
            rows="1"
            maxlength="500"
            placeholder="พิมพ์คำถาม เช่น ตาราง G01 วันจันทร์"
            (keydown.enter)="onEnter($event)"
          ></textarea>
          <button type="submit" class="btn primary icon" [disabled]="chat.busy() || !draft().trim()" aria-label="ส่ง">
            <app-icon name="send" [size]="17" />
          </button>
        </form>
      </section>
    }

    <button type="button" class="chat-fab" (click)="chat.toggle()" aria-label="เปิดผู้ช่วยจัดตาราง">
      <app-icon [name]="chat.open() ? 'x' : 'chat'" [size]="26" />
      @if (chat.unread() > 0 && !chat.open()) {
        <span class="unread">{{ chat.unread() }}</span>
      }
    </button>

    <app-pdf-preview [url]="chat.pdfUrl()" (closed)="chat.pdfUrl.set(null)" />
  `,
  styles: `
    .chat-fab {
      position: fixed;
      right: 22px;
      bottom: 22px;
      z-index: 1200;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      border: none;
      background: linear-gradient(135deg, var(--maroon-700), var(--maroon-900));
      color: #fff;
      box-shadow: var(--shadow-lg);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .unread {
      position: absolute;
      top: -2px;
      right: -2px;
      min-width: 22px;
      height: 22px;
      padding: 0 6px;
      border-radius: 999px;
      background: var(--danger);
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .chat-panel {
      position: fixed;
      right: 22px;
      bottom: 94px;
      z-index: 1200;
      width: min(410px, calc(100vw - 24px));
      height: min(590px, calc(100vh - 120px));
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: var(--shadow-lg);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .chat-head {
      padding: 12px 14px;
      background: linear-gradient(135deg, var(--maroon-800), var(--maroon-950));
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .chat-head .btn {
      color: #fff;
    }
    .bot-tile {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.16);
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .status-line {
      font-size: 11.5px;
      opacity: 0.85;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #4ade80;
    }
    .chat-body {
      flex: 1 1 auto;
      overflow-y: auto;
      padding: 14px;
      background: var(--bg);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .chat-welcome {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .msg {
      display: flex;
      flex-direction: column;
      gap: 5px;
      max-width: 92%;
    }
    .msg.user {
      align-self: flex-end;
      align-items: flex-end;
    }
    .msg.bot {
      align-self: flex-start;
      align-items: flex-start;
    }
    .bubble {
      padding: 9px 13px;
      border-radius: 13px;
      font-size: 13.5px;
      line-height: 1.5;
      background: var(--surface);
      border: 1px solid var(--border);
    }
    .msg.user .bubble {
      background: var(--maroon-700);
      color: #fff;
      border-color: var(--maroon-700);
    }
    .time {
      font-size: 11px;
      color: var(--text-muted);
    }
    .cards {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
    }
    .c-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .action-card {
      border-left: 3px solid var(--maroon-700);
    }
    .action-card.danger {
      border-left-color: var(--danger);
    }
    .c-title {
      font-weight: 600;
      font-size: 13px;
      color: var(--maroon-800);
    }
    .c-table-wrap {
      overflow-x: auto;
      max-height: 220px;
    }
    .c-table-wrap table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .c-table-wrap th,
    .c-table-wrap td {
      padding: 5px 7px;
      border-bottom: 1px solid var(--border);
      text-align: left;
    }
    .c-table-wrap th {
      background: var(--maroon-50);
    }
    .c-link {
      font-size: 12.5px;
      font-weight: 600;
    }
    .c-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .ask-item {
      text-align: left;
      padding: 6px 9px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border);
      background: var(--maroon-50);
      color: var(--maroon-800);
      font: inherit;
      font-size: 12.5px;
      cursor: pointer;
    }
    .plain-item {
      font-size: 12.5px;
      padding: 3px 0;
      border-bottom: 1px dashed var(--border);
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .chip {
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid var(--maroon-200);
      background: var(--maroon-50);
      color: var(--maroon-800);
      font: inherit;
      font-size: 12px;
      cursor: pointer;
    }
    .action-foot {
      margin-top: 4px;
    }
    .chat-foot {
      padding: 10px 12px;
      border-top: 1px solid var(--border);
      background: var(--surface);
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }
    .chat-foot textarea {
      flex: 1 1 auto;
      resize: none;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      padding: 8px 10px;
      font: inherit;
      max-height: 96px;
    }
    .typing {
      display: flex;
      gap: 4px;
      padding: 12px 14px;
    }
    .typing span {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--maroon-600);
      animation: bounce 1.1s infinite ease-in-out;
    }
    .typing span:nth-child(2) {
      animation-delay: 0.15s;
    }
    .typing span:nth-child(3) {
      animation-delay: 0.3s;
    }
    @keyframes bounce {
      0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
      40% { opacity: 1; transform: translateY(-4px); }
    }
  `,
})
export class ChatWidget {
  readonly chat = inject(ChatService);
  readonly auth = inject(AuthService);
  readonly draft = signal('');
  readonly scrollArea = viewChild<ElementRef<HTMLElement>>('scrollArea');

  readonly quickStarters = ['ตาราง G01 วันจันทร์', 'ห้องไหนว่าง วันพุธ คาบ 3', 'จัดตารางใหม่', 'ทำอะไรได้บ้าง'];

  constructor() {
    effect(() => {
      this.chat.messages();
      this.chat.busy();
      this.chat.open();
      setTimeout(() => {
        const el = this.scrollArea()?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      });
    });
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.chat.open()) this.chat.close();
  }

  onEnter(e: Event) {
    const ke = e as KeyboardEvent;
    if (!ke.shiftKey) {
      e.preventDefault();
      this.sendDraft();
    }
  }

  onSubmit(e: Event) {
    e.preventDefault();
    this.sendDraft();
  }

  sendDraft() {
    const t = this.draft().trim();
    if (!t) return;
    this.draft.set('');
    void this.chat.send(t);
  }

  isString(v: string | { label: string; action: ChatAction }): v is string {
    return typeof v === 'string';
  }

  asString(v: string | { label: string; action: ChatAction }): string {
    return typeof v === 'string' ? v : v.label;
  }

  splitLines(text: string): string[] {
    return String(text || '').split('\n');
  }

  parseBold(line: string): TextSegment[] {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return parts
      .filter(Boolean)
      .map((p) => (p.startsWith('**') && p.endsWith('**') ? { text: p.slice(2, -2), bold: true } : { text: p, bold: false }));
  }
}
