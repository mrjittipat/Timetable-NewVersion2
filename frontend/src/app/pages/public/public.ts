import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { EntityRef, Grid, Term, View } from '../../core/models';
import { Icon } from '../../shared/icon';
import { TimetableSheet } from '../timetable/sheet';

@Component({
  selector: 'app-public-page',
  standalone: true,
  imports: [FormsModule, RouterLink, Icon, TimetableSheet],
  template: `
    <header class="pub-head">
      <div class="row">
        <span class="pub-logo"><img src="logo.png" alt="วิทยาลัยเทคนิคพังงา" width="36" height="36" /></span>
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
      <section class="pub-bar card card-body">
        <div class="row wrap-row">
          <div class="segmented" role="group" aria-label="เลือกภาคเรียน">
            <button type="button" [class.active]="effectiveTerm() === '1'" (click)="selectTerm('1')">ภาคเรียนที่ 1</button>
            <button type="button" [class.active]="effectiveTerm() === '2'" (click)="selectTerm('2')">ภาคเรียนที่ 2</button>
          </div>
          @if (info(); as i) {
            <span class="small muted">แสดงผล: ภาคเรียนที่ {{ i.semester }} ปีการศึกษา {{ i.year }}</span>
          }
        </div>
      </section>

      @if (info() && !info()!.enabled) {
        <section class="card card-body empty">
          <app-icon name="calendar" [size]="34" />
          <h3>ยังไม่มีการเผยแพร่ตารางเรียนในภาคเรียนที่ {{ effectiveTerm() }}</h3>
          <p class="muted">ผู้ดูแลระบบปิดการเผยแพร่ตารางสาธารณะไว้ชั่วคราว</p>
        </section>
      } @else if (info() && !info()!.hasTimetable) {
        <section class="card card-body empty">
          <app-icon name="calendar" [size]="34" />
          <h3>ยังไม่มีการเผยแพร่ตารางเรียนในภาคเรียนที่ {{ effectiveTerm() }}</h3>
          <p class="muted">ลองสลับดูอีกภาคเรียนหรือรอผู้ดูแลระบบจัดตาราง</p>
        </section>
      } @else if (idInput() && viewInput()) {
        <div class="row">
          <a class="btn sm" routerLink="/p" [queryParams]="{ term: effectiveTerm() }">← กลับหน้าดัชนี</a>
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
              <a class="pub-card" [routerLink]="['/p', indexView(), e.id]" [queryParams]="{ term: effectiveTerm() }">
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
      width: 36px;
      height: 36px;
      background: transparent;
      border: none;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .pub-logo img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .pub-bar {
      padding: 10px 14px;
    }
    .wrap-row {
      flex-wrap: wrap;
      justify-content: space-between;
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
  private readonly router = inject(Router);
  readonly viewInput = input<string>('', { alias: 'view' });
  readonly idInput = input<string>('', { alias: 'id' });
  readonly termInput = input<string>('', { alias: 'term' });

  readonly selectedTerm = signal<Term | null>(null);
  readonly effectiveTerm = computed<Term>(() => {
    const sel = this.selectedTerm();
    if (sel) return sel;
    return this.termInput() === '1' ? '1' : '2';
  });

  readonly info = signal<{
    term: Term;
    enabled: boolean;
    college: string;
    semester: string;
    year: string;
    hasTimetable: boolean;
    terms: { term: Term; label: string; semester: string; year: string; enabled: boolean; hasTimetable: boolean }[];
  } | null>(null);
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
      const ti = this.termInput();
      if (ti === '1' || ti === '2') this.selectedTerm.set(ti);
    });

    effect(() => {
      const v = this.viewInput();
      const id = this.idInput();
      const t = this.effectiveTerm();
      void this.load(v, id, t);
    });
  }

  selectTerm(t: Term) {
    this.selectedTerm.set(t);
    this.grid.set(null);
    void this.router.navigate([], { queryParams: { term: t }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  async load(view: string, id: string, term: Term) {
    try {
      const inf = await this.api.getPublicInfo(term);
      this.info.set(inf);
      if (!this.termInput() && !this.selectedTerm() && !inf.hasTimetable) {
        const alt = inf.terms?.find((x) => x.enabled && x.hasTimetable);
        if (alt && alt.term !== term) {
          this.selectedTerm.set(alt.term);
          return;
        }
      }
      if (!inf.enabled || !inf.hasTimetable) {
        this.grid.set(null);
        this.entities.set(null);
        return;
      }
      if (view && id) {
        const rv: View = view === 'teacher' || view === 'room' ? view : 'group';
        this.grid.set(await this.api.getPublicGrid(rv, id, term));
      } else {
        this.entities.set(await this.api.getPublicEntities(term));
      }
    } catch {
      // handled gracefully
    }
  }

  formatTime(iso: string) {
    return new Date(iso).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  }
}
