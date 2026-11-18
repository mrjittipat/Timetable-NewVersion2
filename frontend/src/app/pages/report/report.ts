import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Check } from '../../core/models';
import { AppState } from '../../core/state';
import { Icon } from '../../shared/icon';

const GROUPS: { type: Check['type']; title: string }[] = [
  { type: 'integrity', title: 'ความถูกต้องพื้นฐานของตาราง (Integrity)' },
  { type: 'basic', title: 'เงื่อนไขพื้นฐานบังคับ (Basic)' },
  { type: 'special', title: 'เงื่อนไขพิเศษแบบเปิด/ปิดได้ (Special)' },
];

@Component({
  selector: 'app-report-page',
  standalone: true,
  imports: [RouterLink, Icon],
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <div class="eyebrow">Validator อิสระจาก solver</div>
          <h1>ผลตรวจเงื่อนไข</h1>
          <p class="muted">ตรวจสอบความถูกต้องของตารางเรียนครบทุกข้ออย่างเป็นอิสระจากตัวจัดตาราง</p>
        </div>
        <div class="segmented">
          <button type="button" [class.active]="filter() === 'all'" (click)="filter.set('all')">ทั้งหมด</button>
          <button type="button" [class.active]="filter() === 'failed'" (click)="filter.set('failed')">เฉพาะที่ไม่ผ่าน</button>
        </div>
      </header>

      @if (!state.hasTimetable()) {
        <section class="card card-body empty">
          <app-icon name="shield" [size]="34" />
          <h3>ยังไม่มีตารางเรียนให้ตรวจสอบ</h3>
          <a class="btn primary" routerLink="/solve">ไปหน้าจัดตารางอัตโนมัติ</a>
        </section>
      } @else if (state.timetable()?.validation; as v) {
        <section class="kpis-4">
          <div class="card kpi">
            <span class="small muted">ผ่าน</span>
            <strong style="color: var(--success)">{{ counts().passed }}</strong>
          </div>
          <div class="card kpi">
            <span class="small muted">ไม่ผ่าน</span>
            <strong style="color: var(--danger)">{{ counts().failed }}</strong>
          </div>
          <div class="card kpi">
            <span class="small muted">ไม่ได้เปิดใช้</span>
            <strong>{{ counts().disabled }}</strong>
          </div>
          <div class="card kpi">
            <span class="small muted">แถว output</span>
            <strong>{{ v.stats.rows }}</strong>
          </div>
        </section>

        @for (grp of groups; track grp.type) {
          @let items = checksByType(grp.type);
          @if (items.length > 0) {
            <section class="card">
              <div class="card-head">
                <h3>{{ grp.title }}</h3>
              </div>
              <div class="card-body list-col">
                @for (ck of items; track ck.id) {
                  <div class="ck-box">
                    <button type="button" class="ck-head" (click)="toggle(ck.id)">
                      <span class="num-tile">{{ ck.id }}</span>
                      <span class="spacer left">{{ ck.name }}</span>
                      @if (!ck.enabled) {
                        <span class="badge neutral">ไม่ได้เปิดใช้</span>
                      } @else if (ck.passed) {
                        <span class="badge success">ผ่าน</span>
                      } @else {
                        <span class="badge danger">ไม่ผ่าน ({{ ck.violationCount }})</span>
                      }
                    </button>

                    @if (openMap()[ck.id] && ck.violations.length > 0) {
                      <div class="ck-body">
                        @for (msg of ck.violations; track $index) {
                          <div class="small v-line">• {{ msg }}</div>
                        }
                        @if (ck.violationCount > ck.violations.length) {
                          <div class="small muted">และอีก {{ ck.violationCount - ck.violations.length }} รายการ</div>
                        }
                      </div>
                    }
                  </div>
                }
              </div>
            </section>
          }
        }
      }
    </div>
  `,
  styles: `
    .kpis-4 {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
    }
    .kpi {
      padding: 16px 18px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .kpi strong {
      font-size: 28px;
    }
    .list-col {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .ck-box {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
    }
    .ck-head {
      width: 100%;
      padding: 10px 14px;
      background: var(--surface);
      border: none;
      display: flex;
      align-items: center;
      gap: 10px;
      font: inherit;
      cursor: pointer;
    }
    .ck-head:hover {
      background: var(--maroon-50);
    }
    .left {
      text-align: left;
      font-weight: 500;
    }
    .num-tile {
      min-width: 34px;
      padding: 2px 7px;
      border-radius: var(--radius-sm);
      background: var(--maroon-100);
      color: var(--maroon-800);
      font-weight: 700;
      font-size: 12px;
    }
    .ck-body {
      padding: 10px 16px;
      border-top: 1px solid var(--border);
      background: var(--bg);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .v-line {
      color: var(--danger);
    }
    @media (max-width: 720px) {
      .kpis-4 {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `,
})
export class ReportPage {
  readonly state = inject(AppState);
  readonly filter = signal<'all' | 'failed'>('all');
  readonly openMap = signal<Record<string, boolean>>({});
  readonly groups = GROUPS;

  readonly counts = computed(() => {
    const cks = this.state.timetable()?.validation?.checks || [];
    return {
      passed: cks.filter((c) => c.enabled && c.passed).length,
      failed: cks.filter((c) => c.enabled && !c.passed).length,
      disabled: cks.filter((c) => !c.enabled).length,
    };
  });

  checksByType(type: Check['type']) {
    const cks = this.state.timetable()?.validation?.checks || [];
    return cks.filter((c) => c.type === type && (this.filter() === 'all' || !c.passed));
  }

  toggle(id: string) {
    this.openMap.update((m) => ({ ...m, [id]: !m[id] }));
  }
}
