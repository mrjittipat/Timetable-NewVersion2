import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { StatsResponse } from '../../core/models';
import { AppState } from '../../core/state';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-teacher-summary-page',
  standalone: true,
  imports: [FormsModule, RouterLink, Icon],
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <div class="eyebrow">สรุปภาระงานสอนรายบุคคล</div>
          <h1>ข้อมูลสรุปการสอนของครูรายบุคคล</h1>
          <p class="muted">แสดงจำนวน ทฤษฎี ปฏิบัติ หน่วยกิต คาบรวม ปวช. คาบรวม ปวส. และคาบรวมทั้งหมด (นับตามเวลาจริง)</p>
        </div>
        <div class="actions">
          <a class="btn" routerLink="/timetable" [queryParams]="{ view: 'teacher' }">
            <app-icon name="calendar" [size]="16" /> ดูตารางสอนครู
          </a>
        </div>
      </header>

      @if (!state.hasTimetable()) {
        <section class="card card-body empty">
          <app-icon name="users" [size]="34" />
          <h3>ยังไม่มีข้อมูลตารางสอน</h3>
          <p class="muted">กรุณาจัดตารางเรียนก่อนเพื่อดูสรุปภาระการสอนของครูรายบุคคล</p>
          <a class="btn primary" routerLink="/solve">ไปหน้าจัดตารางอัตโนมัติ</a>
        </section>
      } @else if (stats(); as st) {
        <section class="kpis">
          <div class="card kpi">
            <span class="small muted">จำนวนครู</span>
            <strong>{{ filtered().length }}</strong>
          </div>
          <div class="card kpi">
            <span class="small muted">รวมทฤษฎี (ท.)</span>
            <strong>{{ totals().theory }}</strong>
          </div>
          <div class="card kpi">
            <span class="small muted">รวมปฏิบัติ (ป.)</span>
            <strong>{{ totals().practice }}</strong>
          </div>
          <div class="card kpi">
            <span class="small muted">รวมหน่วยกิต (น.)</span>
            <strong>{{ totals().credit }}</strong>
          </div>
          <div class="card kpi">
            <span class="small muted">คาบรวม ปวช.</span>
            <strong>{{ totals().pvc }}</strong>
          </div>
          <div class="card kpi">
            <span class="small muted">คาบรวม ปวส.</span>
            <strong>{{ totals().pvs }}</strong>
          </div>
          <div class="card kpi highlight">
            <span class="small">คาบรวมทั้งหมด</span>
            <strong>{{ totals().total }}</strong>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div class="segmented">
              <button type="button" [class.active]="deptFilter() === ''" (click)="deptFilter.set('')">ทุกสาขาวิชา</button>
              @for (d of departments(); track d) {
                <button type="button" [class.active]="deptFilter() === d" (click)="deptFilter.set(d)">{{ d }}</button>
              }
            </div>
            <div class="search-box">
              <app-icon name="search" [size]="16" />
              <input class="input" [(ngModel)]="query" placeholder="ค้นหาชื่อครูหรือรหัสครู…" />
            </div>
          </div>

          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th></th>
                  <th>รหัส</th>
                  <th>ชื่อ-สกุล</th>
                  <th>ตำแหน่ง</th>
                  <th>สาขาวิชา</th>
                  <th class="num">ทฤษฎี</th>
                  <th class="num">ปฏิบัติ</th>
                  <th class="num">หน่วยกิต</th>
                  <th class="num">คาบรวม ปวช.</th>
                  <th class="num">คาบรวม ปวส.</th>
                  <th class="num">คาบรวมทั้งหมด</th>
                  <th>เกณฑ์</th>
                  <th>ตาราง</th>
                </tr>
              </thead>
              <tbody>
                @for (t of filtered(); track t.id) {
                  <tr>
                    <td>
                      <button type="button" class="btn ghost sm icon" (click)="toggleExpand(t.id)" title="ดูรายวิชาที่สอน">
                        <app-icon name="chevron" [size]="16" />
                      </button>
                    </td>
                    <td class="mono">{{ t.id }}</td>
                    <td>
                      <strong>{{ t.name }}</strong>
                      @if (t.specialRole) {
                        <div class="small muted">{{ t.specialRole }}</div>
                      }
                    </td>
                    <td>
                      <span class="badge" [class.success]="t.role === 'Leader'" [class.neutral]="t.role !== 'Leader'">
                        {{ t.role === 'Leader' ? 'หัวหน้าแผนก' : 'ครูผู้สอน' }}
                      </span>
                    </td>
                    <td>{{ t.department }}</td>
                    <td class="num">{{ t.theory }}</td>
                    <td class="num">{{ t.practice }}</td>
                    <td class="num">{{ t.credit }}</td>
                    <td class="num">{{ t.pvcPeriods }}</td>
                    <td class="num">{{ t.pvsPeriods }}</td>
                    <td class="num"><strong>{{ t.totalPeriods }}</strong></td>
                    <td>
                      <span class="badge" [class.success]="t.inRange" [class.danger]="!t.inRange">
                        {{ t.minLoad }}–{{ t.maxLoad }} ({{ t.inRange ? 'ผ่าน' : 'นอกเกณฑ์' }})
                      </span>
                    </td>
                    <td>
                      <a class="btn sm" routerLink="/timetable" [queryParams]="{ view: 'teacher', id: t.id }">ดูตาราง</a>
                    </td>
                  </tr>

                  @if (expanded()[t.id]) {
                    <tr class="sub-row">
                      <td colspan="13">
                        <div class="sub-box">
                          <strong>รายวิชาที่สอน ({{ t.subjects.length }} รายการ)</strong>
                          <table class="table inner-table">
                            <thead>
                              <tr>
                                <th>รหัสวิชา</th>
                                <th>ชื่อรายวิชา</th>
                                <th>กลุ่มเรียน</th>
                                <th>ระดับ</th>
                                <th class="num">ท.</th>
                                <th class="num">ป.</th>
                                <th class="num">น.</th>
                                <th class="num">คาบที่จัด</th>
                                <th>หมายเหตุ</th>
                              </tr>
                            </thead>
                            <tbody>
                              @for (s of t.subjects; track s.group_id + '|' + s.subject_id) {
                                <tr>
                                  <td class="mono">{{ s.subject_id }}</td>
                                  <td>{{ s.subject_name }}</td>
                                  <td>{{ s.group_id }} {{ s.group_name }}</td>
                                  <td>{{ s.level }}</td>
                                  <td class="num">{{ s.theory }}</td>
                                  <td class="num">{{ s.practice }}</td>
                                  <td class="num">{{ s.credit }}</td>
                                  <td class="num">{{ s.periods }}</td>
                                  <td>
                                    @if (s.isJoint) {
                                      <span class="badge">เรียนร่วม</span>
                                    }
                                  </td>
                                </tr>
                              }
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    </div>
  `,
  styles: `
    .kpis {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 12px;
    }
    .kpi {
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .kpi strong {
      font-size: 24px;
      color: var(--maroon-700);
    }
    .kpi.highlight {
      background: var(--maroon-700);
      color: #fff;
    }
    .kpi.highlight strong {
      color: #fff;
    }
    .search-box {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 260px;
    }
    .num {
      text-align: right;
    }
    .sub-row td {
      background: var(--bg);
      padding: 12px 18px;
    }
    .sub-box {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .inner-table th,
    .inner-table td {
      padding: 6px 10px;
      font-size: 12.5px;
    }
    @media (max-width: 1100px) {
      .kpis {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }
  `,
})
export class TeacherSummaryPage {
  readonly state = inject(AppState);
  private readonly api = inject(Api);

  readonly stats = signal<StatsResponse | null>(null);
  readonly deptFilter = signal('');
  readonly query = signal('');
  readonly expanded = signal<Record<string, boolean>>({});

  readonly departments = computed(() => {
    const list = this.stats()?.teacherSummary || [];
    return [...new Set(list.map((t) => t.department).filter((d) => d && d !== '-'))];
  });

  readonly filtered = computed(() => {
    const list = this.stats()?.teacherSummary || [];
    const dept = this.deptFilter();
    const q = this.query().trim().toLowerCase();
    return list.filter((t) => {
      if (dept && t.department !== dept) return false;
      if (q && !`${t.id} ${t.name} ${t.specialRole}`.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  readonly totals = computed(() => {
    return this.filtered().reduce(
      (acc, t) => ({
        theory: acc.theory + t.theory,
        practice: acc.practice + t.practice,
        credit: acc.credit + t.credit,
        pvc: acc.pvc + t.pvcPeriods,
        pvs: acc.pvs + t.pvsPeriods,
        total: acc.total + t.totalPeriods,
      }),
      { theory: 0, practice: 0, credit: 0, pvc: 0, pvs: 0, total: 0 }
    );
  });

  constructor() {
    effect(() => {
      this.state.version();
      if (this.state.hasTimetable()) void this.load();
    });
  }

  async load() {
    try {
      this.stats.set(await this.api.getStats());
    } catch {
      // ignore
    }
  }

  toggleExpand(id: string) {
    this.expanded.update((m) => ({ ...m, [id]: !m[id] }));
  }
}
