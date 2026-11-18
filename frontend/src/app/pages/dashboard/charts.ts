import { Component, computed, input, signal } from '@angular/core';
import { StatsResponse } from '../../core/models';

const DAY_TH: Record<string, string> = {
  Mon: 'จันทร์',
  Tue: 'อังคาร',
  Wed: 'พุธ',
  Thu: 'พฤหัสบดี',
  Fri: 'ศุกร์',
  Sat: 'เสาร์',
  Sun: 'อาทิตย์',
};

@Component({
  selector: 'app-dashboard-charts',
  standalone: true,
  template: `
    <div class="charts-grid">
      <!-- 1. Teacher Load -->
      <section class="card">
        <div class="card-head">
          <h3>ภาระสอนของครู</h3>
          <div class="segmented">
            <button type="button" [class.active]="mode1() === 'chart'" (click)="mode1.set('chart')">กราฟ</button>
            <button type="button" [class.active]="mode1() === 'table'" (click)="mode1.set('table')">ตาราง</button>
          </div>
        </div>
        <div class="card-body">
          @if (mode1() === 'chart') {
            <div class="bars-wrap" role="img" [attr.aria-label]="'กราฟภาระสอนของครู เฉลี่ย ' + avgTeacherLoad() + ' คาบ'">
              <div class="avg-line" [style.left.%]="avgTeacherPct()" [title]="'เฉลี่ย ' + avgTeacherLoad() + ' คาบ'">
                <span>เฉลี่ย {{ avgTeacherLoad() }}</span>
              </div>
              @for (t of stats().teacherLoad; track t.id) {
                <div class="bar-row" tabindex="0" [title]="teacherTooltip(t)">
                  <div class="bar-label">
                    @if (t.role === 'Leader') {
                      <span class="l-badge" title="หัวหน้าแผนกวิชา (Leader)">L</span>
                    }
                    <span class="truncate">{{ t.name }}</span>
                  </div>
                  <div class="bar-track">
                    <div class="bar-fill" [style.width.%]="pctOf(t.periods, maxTeacherLoad())"></div>
                  </div>
                  <span class="bar-val">{{ t.periods }}</span>
                </div>
              }
            </div>
          } @else {
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>ครูผู้สอน</th>
                    <th>ตำแหน่ง</th>
                    @for (d of stats().days; track d) {
                      <th>{{ dayLabel(d) }}</th>
                    }
                    <th>รวม</th>
                  </tr>
                </thead>
                <tbody>
                  @for (t of stats().teacherLoad; track t.id) {
                    <tr>
                      <td>{{ t.name }}</td>
                      <td>{{ t.role }}</td>
                      @for (c of t.perDay; track $index) {
                        <td>{{ c }}</td>
                      }
                      <td><strong>{{ t.periods }}</strong></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      </section>

      <!-- 2. Room Usage -->
      <section class="card">
        <div class="card-head">
          <h3>การใช้ห้องเรียน</h3>
          <div class="segmented">
            <button type="button" [class.active]="mode3() === 'chart'" (click)="mode3.set('chart')">กราฟ</button>
            <button type="button" [class.active]="mode3() === 'table'" (click)="mode3.set('table')">ตาราง</button>
          </div>
        </div>
        <div class="card-body">
          @if (mode3() === 'chart') {
            <div class="bars-wrap" role="img" aria-label="กราฟอัตราการใช้ห้องเรียนรายสัปดาห์">
              @for (r of stats().roomUsage; track r.id) {
                <div class="bar-row" [title]="r.id + ' (' + r.type + '): ' + r.periods + ' คาบ (' + r.pct + '%)'">
                  <div class="bar-label">
                    <span class="mono">{{ r.id }}</span>
                    <small class="muted truncate">{{ r.type }}</small>
                  </div>
                  <div class="bar-track">
                    <div class="bar-fill alt" [style.width.%]="r.pct"></div>
                  </div>
                  <span class="bar-val">{{ r.pct }}%</span>
                </div>
              }
            </div>
          } @else {
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>ห้อง</th>
                    <th>ประเภท</th>
                    <th>คาบ/สัปดาห์</th>
                    <th>อัตราใช้</th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of stats().roomUsage; track r.id) {
                    <tr>
                      <td class="mono">{{ r.id }}</td>
                      <td>{{ r.type }}</td>
                      <td>{{ r.periods }}</td>
                      <td>{{ r.pct }}%</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      </section>
    </div>

    <!-- 3. Heat Map -->
    <section class="card">
      <div class="card-head">
        <h3>ความหนาแน่นของการเรียน</h3>
        <div class="row">
          <div class="legend small muted">
            <span>น้อย</span>
            <span class="swatch s0"></span>
            <span class="swatch s1"></span>
            <span class="swatch s2"></span>
            <span class="swatch s3"></span>
            <span>มาก</span>
          </div>
          <div class="segmented">
            <button type="button" [class.active]="mode2() === 'chart'" (click)="mode2.set('chart')">กราฟ</button>
            <button type="button" [class.active]="mode2() === 'table'" (click)="mode2.set('table')">ตาราง</button>
          </div>
        </div>
      </div>
      <div class="card-body">
        @if (mode2() === 'chart') {
          <div class="heat-wrap" role="img" aria-label="แผนที่ความหนาแน่นจำนวนกลุ่มเรียนแยกตามวันและคาบ">
            <table class="heat-table">
              <thead>
                <tr>
                  <th>วัน / คาบ</th>
                  @for (p of stats().periods; track p) {
                    <th [class.hatched]="p === stats().breakPeriod || p === stats().homeroomPeriod">
                      {{ p }}
                      @if (p === stats().homeroomPeriod) {
                        <small>HR</small>
                      } @else if (p === stats().breakPeriod) {
                        <small>พัก</small>
                      }
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (d of stats().days; track d; let di = $index) {
                  <tr>
                    <th>{{ dayLabel(d) }}</th>
                    @for (p of stats().periods; track p; let pi = $index) {
                      @let v = stats().heat[di][pi];
                      @if (v === null) {
                        <td class="hatched" [title]="p === stats().homeroomPeriod ? 'Homeroom' : 'พักเที่ยง'">
                          {{ p === stats().homeroomPeriod ? 'HR' : 'พัก' }}
                        </td>
                      } @else {
                        <td [style.background]="heatColor(v)" [style.color]="v > stats().groups * 0.5 ? '#fff' : 'var(--text)'" [title]="dayLabel(d) + ' คาบ ' + p + ': ' + v + ' กลุ่ม'">
                          {{ v }}
                        </td>
                      }
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>วัน</th>
                  @for (p of stats().periods; track p) {
                    <th>คาบ {{ p }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (d of stats().days; track d; let di = $index) {
                  <tr>
                    <td><strong>{{ dayLabel(d) }}</strong></td>
                    @for (p of stats().periods; track p; let pi = $index) {
                      @let v = stats().heat[di][pi];
                      <td>{{ v === null ? (p === stats().homeroomPeriod ? 'Homeroom' : 'พัก') : v }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </section>
  `,
  styles: `
    .charts-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
    }
    .bars-wrap {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .avg-line {
      position: absolute;
      top: 0;
      bottom: 0;
      border-left: 1.5px dashed var(--maroon-600);
      pointer-events: none;
      z-index: 2;
      display: none;
    }
    .bar-row {
      display: grid;
      grid-template-columns: 165px 1fr 48px;
      align-items: center;
      gap: 10px;
    }
    .bar-label {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      font-size: 13px;
    }
    .truncate {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .l-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border-radius: 4px;
      background: var(--maroon-700);
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .bar-track {
      width: 100%;
      height: 14px;
      border-radius: 999px;
      background: var(--maroon-50);
      overflow: hidden;
      border: 1px solid var(--border);
    }
    .bar-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--maroon-600), var(--maroon-800));
      border-radius: 999px;
    }
    .bar-fill.alt {
      background: linear-gradient(90deg, #9b1b30, #5c0017);
    }
    .bar-val {
      text-align: right;
      font-weight: 600;
      font-size: 13px;
    }
    .legend {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .swatch {
      width: 14px;
      height: 14px;
      border-radius: 3px;
      border: 1px solid var(--border-strong);
    }
    .swatch.s0 { background: #fcf4f5; }
    .swatch.s1 { background: #ecc7ce; }
    .swatch.s2 { background: #b84a5f; }
    .swatch.s3 { background: #800020; }
    .heat-wrap {
      overflow-x: auto;
    }
    .heat-table {
      width: 100%;
      border-collapse: collapse;
      text-align: center;
      font-size: 13px;
    }
    .heat-table th,
    .heat-table td {
      border: 1px solid var(--border-strong);
      padding: 8px 6px;
      min-width: 44px;
    }
    .heat-table th {
      background: var(--maroon-50);
      font-weight: 600;
    }
    .heat-table th small {
      display: block;
      font-size: 10px;
      color: var(--text-muted);
    }
    .hatched {
      background: repeating-linear-gradient(
        -45deg,
        #f6f1f2,
        #f6f1f2 5px,
        #eadce0 5px,
        #eadce0 10px
      );
      color: var(--text-muted);
      font-weight: 600;
      font-size: 11.5px;
    }
    @media (max-width: 960px) {
      .charts-grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class DashboardCharts {
  readonly stats = input.required<StatsResponse>();
  readonly mode1 = signal<'chart' | 'table'>('chart');
  readonly mode2 = signal<'chart' | 'table'>('chart');
  readonly mode3 = signal<'chart' | 'table'>('chart');

  readonly maxTeacherLoad = computed(() => {
    const loads = this.stats().teacherLoad.map((t) => t.periods);
    return Math.max(40, ...loads);
  });

  readonly avgTeacherLoad = computed(() => {
    const list = this.stats().teacherLoad;
    if (!list.length) return 0;
    return Math.round((list.reduce((s, t) => s + t.periods, 0) / list.length) * 10) / 10;
  });

  readonly avgTeacherPct = computed(() => this.pctOf(this.avgTeacherLoad(), this.maxTeacherLoad()));

  pctOf(val: number, max: number) {
    return max > 0 ? Math.min(100, Math.round((val / max) * 1000) / 10) : 0;
  }

  dayLabel(d: string) {
    return DAY_TH[d] || d;
  }

  teacherTooltip(t: StatsResponse['teacherLoad'][number]) {
    const days = this.stats().days;
    return `${t.name}: ${days.map((d, i) => `${this.dayLabel(d)} ${t.perDay[i] || 0}`).join(' · ')}`;
  }

  heatColor(v: number) {
    const max = Math.max(1, this.stats().groups);
    const ratio = v / max;
    return `rgba(128, 0, 32, ${(0.08 + ratio * 0.85).toFixed(2)})`;
  }
}
