import { Injectable, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Api } from './api';
import { AuthService } from './auth';
import { ChatAction, ChatMessage } from './models';
import { AppState } from './state';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthService);
  private readonly state = inject(AppState);
  private readonly router = inject(Router);

  readonly open = signal(false);
  readonly busy = signal(false);
  readonly unread = signal(0);
  readonly messages = signal<ChatMessage[]>([]);
  readonly pdfUrl = signal<string | null>(null);

  private chatContext: Record<string, string> = {};
  private loadedKey = '';

  constructor() {
    effect(() => {
      const uname = this.auth.user()?.username || '';
      const key = uname ? `tt-chat-v1:${uname}` : '';
      if (key === this.loadedKey) return;
      this.loadedKey = key;
      if (!key) {
        this.messages.set([]);
        this.chatContext = {};
        return;
      }
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw) as { messages?: ChatMessage[]; context?: Record<string, string> };
          this.messages.set(Array.isArray(parsed.messages) ? parsed.messages.slice(-80) : []);
          this.chatContext = parsed.context || {};
        } else {
          this.messages.set([]);
          this.chatContext = {};
        }
      } catch {
        this.messages.set([]);
        this.chatContext = {};
      }
    });
  }

  private persist() {
    if (!this.loadedKey) return;
    try {
      localStorage.setItem(
        this.loadedKey,
        JSON.stringify({ messages: this.messages().slice(-80), context: this.chatContext })
      );
    } catch {
      // ignore quota error
    }
  }

  private nowTime() {
    return new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  }

  toggle() {
    const next = !this.open();
    this.open.set(next);
    if (next) this.unread.set(0);
  }

  close() {
    this.open.set(false);
  }

  clear() {
    this.messages.set([]);
    this.chatContext = {};
    this.persist();
  }

  async send(rawText: string) {
    const text = rawText.trim();
    if (!text || this.busy()) return;
    const userMsg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      from: 'user',
      text,
      time: this.nowTime(),
    };
    this.messages.update((m) => [...m, userMsg].slice(-80));
    this.persist();
    this.busy.set(true);

    try {
      const res = await this.api.chat(text, this.chatContext);
      if (res.intent === 'clear') {
        this.messages.set([]);
        this.chatContext = {};
      } else {
        this.chatContext = res.context || {};
        const botMsg: ChatMessage = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          from: 'bot',
          text: res.text,
          cards: res.cards,
          suggestions: res.suggestions,
          time: this.nowTime(),
        };
        this.messages.update((m) => [...m, botMsg].slice(-80));
        if (!this.open()) this.unread.update((u) => u + 1);

        // Auto-run navigate / export buttons marked auto: true
        for (const card of res.cards || []) {
          if (card.type === 'buttons' && card.items) {
            for (const item of card.items) {
              if (typeof item !== 'string' && item.action?.auto) {
                this.runButtonAction(item.action);
              }
            }
          }
        }
      }
      this.persist();
    } catch (err) {
      const botMsg: ChatMessage = {
        id: `${Date.now()}-err`,
        from: 'bot',
        text: `เกิดข้อผิดพลาด: ${this.api.errorMessage(err)}`,
        time: this.nowTime(),
      };
      this.messages.update((m) => [...m, botMsg].slice(-80));
      this.persist();
    } finally {
      this.busy.set(false);
    }
  }

  // Address card strictly by messageId + cardIdx (Part E.3)
  private patchCard(msgId: string, cardIdx: number, patch: Record<string, unknown>) {
    this.messages.update((list) =>
      list.map((m) => {
        if (m.id !== msgId || !m.cards) return m;
        return {
          ...m,
          cards: m.cards.map((c, idx) => (idx === cardIdx ? { ...c, ...patch } : c)),
        };
      })
    );
    this.persist();
  }

  async confirmCard(msgId: string, cardIdx: number) {
    const msg = this.messages().find((m) => m.id === msgId);
    const card = msg?.cards?.[cardIdx];
    if (!card?.action || card.status === 'running' || card.status === 'done') return;

    this.patchCard(msgId, cardIdx, { status: 'running' });
    try {
      const res = await this.api.chatAction(card.action.kind, card.action.payload || {});
      this.patchCard(msgId, cardIdx, {
        status: res.ok ? 'done' : 'error',
        resultText: res.text,
      });
      if (res.refresh) {
        await this.state.refresh();
        this.state.bump();
      }
    } catch (err) {
      this.patchCard(msgId, cardIdx, {
        status: 'error',
        resultText: this.api.errorMessage(err),
      });
    }
  }

  runButtonAction(action: ChatAction) {
    if (action.kind === 'ask' && typeof action.payload === 'string') {
      void this.send(action.payload);
    } else if (action.kind === 'navigate' && typeof action.payload === 'string') {
      void this.router.navigateByUrl(action.payload);
    } else if (action.kind === 'export') {
      const p = (action.payload || {}) as { type?: string; view?: string; id?: string };
      const kind = p.type === 'xlsx' ? 'xlsx' : p.type === 'csv' ? 'csv' : 'pdf';
      if (kind === 'pdf') {
        this.pdfUrl.set(this.api.exportUrl('pdf', p.view || 'group', p.id || '', true));
      } else {
        window.open(this.api.exportUrl(kind, p.view, p.id, false), '_blank');
      }
    }
  }
}
