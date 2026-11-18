import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { EntityRef, Grid, View } from '../../core/models';
import { Icon } from '../../shared/icon';
import { TimetableSheet } from '../timetable/sheet';

@Component({
  selector: 'app-public-page',
  standalone: true,
  imports: [FormsModule, RouterLink, Icon, TimetableSheet],
  template: `
    <header class="pub-head">
      <div class="row">
        <span class="pub-logo"><img src="logo.png" alt="" width="24" height="24" /></span>
        <div>
          <strong>{{ info()?.college || 'วิทยาลัยเทคนิคพังงา' }}</strong>
          @if (info(); as i) {
            <span class="small"> · ภาคเรียน {{ i.semester }}/{{ i.year }}</span>
          }
        </div>
      </div>
      <a class="btn sm" routerLink="/login">เข้าสู่ระบบ</a>
    </header>

    <main class="page">
      @if (info() && !info()!.enabled) {
        <section class="card card-body empty">
          <app-icon name="calendar" [size]="34" />
          <h3>ยังไม่มีการเผยแพร่ตารางเรียน</h3>
          <p class="muted">ผู้ดูแลระบบปิดการเผยแพร่ตารางสาธารณะไว้ชั่วคราว</p>
        </section>
      } @else if (info() && !info()!.hasTimetable) {
        <section class="card card-body empty">
          <app-icon name="calendar" [size]="34" />
          <h3>ยังไม่มีการเผยแพร่ตารางเรียน</h3>
        </section>
      } @else if (idInput() && viewInput()) {
        <div class="row">
          <a class="btn sm" routerLink="/p">← กลับหน้าดัชนี</a>
        </div>
        @if (grid(); as g) {
          <section class="card">
            <div class="card-head">
              <div>
                <h2>{{ g.entity?.title }}</h2>
                <div class="small muted">{{ g.entity?.subtitle }}</div>
              </div>
              @if (g.updatedAt) {
                <span class="small muted">อัปเดตล่าสุด: {{ formatTime(g.updatedAt) }}</span>
              }
            </div>
            <div class="card-body">
              <app-timetable-sheet [grid]="g" [view]="resolvedView()" [editable]="false" />
            </div>
          </section>
        }
      } @else {
        <section class="card">
          <div class="card-head">
            <div class="segmented">
              <button type="button" [class.active]="indexView() === 'group'" (click)="indexView.set('group')">กลุ่มเรียน</button>
              <button type="button" [class.active]="indexView() === 'teacher'" (click)="indexView.set('teacher')">ครูผู้สอน</button>
              <button type="button" [class.active]="indexView() === 'room'" (click)="indexView.set('room')">ห้องเรียน</button>
            </div>
            <div class="search-box">
              <app-icon name="search" [size]="16" />
              <input class="input" [(ngModel)]="search" placeholder="ค้นหา…" />
            </div>
          </div>
          <div class="card-body cards-grid">
            @for (e of filteredEntities(); track e.id) {
              <a class="pub-card" [routerLink]="['/p', indexView(), e.id]">
                <strong>{{ e.title }}</strong>
                <span class="small muted">{{ e.subtitle }}</span>
              </a>
            }
          </div>
        </section>
      }
    </main>
  `,
  styles: `
    .pub-head {
      background: linear-gradient(135deg, var(--maroon-800), var(--maroon-950));
      color: #fff;
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .pub-logo {
      width: 34px;
      height: 34px;
      border-radius: 8px;
      background: #fff;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .search-box {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 240px;
    }
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 12px;
    }
    .pub-card {
      padding: 14px 16px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      color: var(--text);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .pub-card:hover {
      border-color: var(--maroon-700);
      background: var(--maroon-50);
    }
  `,
})
export class PublicPage {
  private readonly api = inject(Api);
  readonly viewInput = input<string>('', { alias: 'view' });
  readonly idInput = input<string>('', { alias: 'id' });

  readonly info = signal<{ enabled: boolean; college: string; semester: string; year: string; hasTimetable: boolean } | null>(null);
  readonly entities = signal<Record<View, EntityRef[]> | null>(null);
  readonly grid = signal<Grid | null>(null);
  readonly indexView = signal<View>('group');
  readonly search = signal('');

  readonly resolvedView = computed<View>(() => {
    const v = this.viewInput();
    return v === 'teacher' || v === 'room' ? v : 'group';
  });

  readonly filteredEntities = computed(() => {
    const list = this.entities()?.[this.indexView()] || [];
    const q = this.search().trim().toLowerCase();
    if (!q) return list;
    return list.filter((e) => `${e.id} ${e.title} ${e.subtitle}`.toLowerCase().includes(q));
  });

  constructor() {
    effect(() => {
      const v = this.viewInput();
      const id = this.idInput();
      void this.load(v, id);
    });
  }

  async load(view: string, id: string) {
    try {
      const inf = await this.api.getPublicInfo();
      this.info.set(inf);
      if (!inf.enabled || !inf.hasTimetable) return;
      if (view && id) {
        const rv: View = view === 'teacher' || view === 'room' ? view : 'group';
        this.grid.set(await this.api.getPublicGrid(rv, id));
      } else {
        this.entities.set(await this.api.getPublicEntities());
      }
    } catch {
      // handled gracefully
    }
  }

  formatTime(iso: string) {
    return new Date(iso).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  }
}
