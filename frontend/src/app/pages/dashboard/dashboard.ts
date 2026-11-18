import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { StatsResponse } from '../../core/models';
import { AppState } from '../../core/state';
import { Icon } from '../../shared/icon';
import { DashboardCharts } from './charts';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [RouterLink, Icon, DashboardCharts],
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <div class="eyebrow">วิทยาลัยเทคนิคพังงา</div>
          <h1>ระบบจัดตารางเรียนอัตโนมัติ</h1>
          <p class="muted">ภาพรวมข้อมูลตั้งต้น ภาระสอนครู และผลตรวจเงื่อนไขล่าสุด</p>
        </div>
        <div class="actions">
          <a class="btn primary" routerLink="/solve">
            <app-icon name="sparkles" [size]="17" /> จัดตารางอัตโนมัติ
          </a>
          <a class="btn" routerLink="/timetable">
            <app-icon name="calendar" [size]="17" /> ดูตารางเรียน
          </a>
        </div>
      </header>

      @if (state.data(); as d) {
        <section class="kpis">
          <div class="card kpi">
            <span class="kpi-label">กลุ่มเรียน</span>
            <strong>{{ d.summary.groups }}</strong>
            <span class="small muted">กลุ่มเรียนทั้งหมด</span>
          </div>
          <div class="card kpi">
            <span class="kpi-label">ครูผู้สอน</span>
            <strong>{{ d.summary.teachers }}</strong>
            <span class="small muted">หัวหน้าแผนก {{ d.summary.leaders }} ท่าน</span>
          </div>
          <div class="card kpi">
            <span class="kpi-label">ห้องเรียนที่ใช้ได้</span>
            <strong>{{ d.summary.rooms }}</strong>
            <span class="small muted">ห้องเรียน/ปฏิบัติการ</span>
          </div>
          <div class="card kpi">
            <span class="kpi-label">รายวิชา</span>
            <strong>{{ d.summary.subjects }}</strong>
            <span class="small muted">{{ d.summary.registrations }} คู่ลงทะเบียน</span>
          </div>
          <div class="card kpi">
            <span class="kpi-label">คาบที่ต้องจัด</span>
            <strong>{{ d.summary.totalPeriods }}</strong>
            <span class="small muted">คาบเรียน/สัปดาห์</span>
          </div>
        </section>
      }

      @if (stats(); as st) {
        <app-dashboard-charts [stats]="st" />
      }

      <div class="grid-2">
        <section class="card">
          <div class="card-head">
            <h3>ผลการจัดตารางล่าสุด</h3>
            <a class="btn sm ghost" routerLink="/report">ดูรายละเอียด →</a>
          </div>
          <div class="card-body">
            @if (state.loading() && !state.timetable()) {
              <div class="row muted"><span class="spinner"></span> กำลังโหลด…</div>
            } @else if (state.timetable(); as tt) {
              @if (tt.validation; as v) {
                <div class="val-top">
                  <div class="ring-box">
                    <svg viewBox="0 0 80 80" width="80" height="80">
                      <circle cx="40" cy="40" r="32" fill="none" stroke="var(--maroon-100)" stroke-width="8" />
                      <circle
                        cx="40"
                        cy="40"
                        r="32"
                        fill="none"
                        [attr.stroke]="v.passed ? 'var(--success)' : 'var(--danger)'"
                        stroke-width="8"
                        stroke-linecap="round"
                        [attr.stroke-dasharray]="201"
                        [attr.stroke-dashoffset]="201 - (201 * passedCount()) / Math.max(1, v.checks.length)"
                        transform="rotate(-90 40 40)"
                      />
                    </svg>
                    <div class="ring-text">
                      <strong>{{ passedCount() }}/{{ v.checks.length }}</strong>
                      <small>เงื่อนไขผ่าน</small>
                    </div>
                  </div>

                  <div class="facts">
                    <div><span class="muted">Seed:</span> <strong>{{ tt.meta?.stats?.seed ?? '-' }}</strong></div>
                    <div><span class="muted">Soft cost:</span> <strong>{{ tt.meta?.stats?.softCostAfter ?? '-' }}</strong></div>
                    <div><span class="muted">เวลาที่ใช้:</span> <strong>{{ tt.meta?.stats?.seconds ?? '-' }} วินาที</strong></div>
                    <div><span class="muted">แถว output:</span> <strong>{{ tt.rows.length }}</strong></div>
                  </div>
                </div>

                <div class="check-list">
                  @for (ck of v.checks; track ck.id) {
                    <div class="ck-row">
                      <span class="ck-icon" [class.ok]="ck.passed" [class.bad]="!ck.passed">
                        {{ ck.passed ? '✓' : '✗' }}
                      </span>
                      <span class="mono small">{{ ck.id }}</span>
                      <span class="spacer small">{{ ck.name }}</span>
                      @if (!ck.enabled) {
                        <span class="badge neutral">ปิด</span>
                      } @else if (ck.violationCount > 0) {
                        <span class="badge danger">{{ ck.violationCount }}</span>
                      }
                    </div>
                  }
                </div>
              } @else {
                <div class="empty">
                  <app-icon name="calendar" [size]="28" />
                  <p>ยังไม่มีผลการจัดตาราง</p>
                  <a class="btn primary sm" routerLink="/solve">ไปหน้าจัดตาราง</a>
                </div>
              }
            }
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <h3>ข้อสังเกตจากข้อมูล</h3>
            <a class="btn sm ghost" routerLink="/data">จัดการข้อมูล →</a>
          </div>
          <div class="card-body">
            @if (state.data()?.warnings?.length) {
              <div class="warn-list">
                @for (w of state.data()!.warnings; track $index) {
                  <div class="alert" [class.danger]="w.level === 'error'" [class.warning]="w.level !== 'error'">
                    <app-icon name="alert" [size]="17" />
                    <span>{{ w.message }}</span>
                  </div>
                }
              </div>
            } @else {
              <div class="alert success">
                <app-icon name="check" [size]="17" />
                <span>ข้อมูลพร้อมสำหรับการจัดตาราง</span>
              </div>
            }

            <h3 class="guide-title">ขั้นตอนการใช้งาน</h3>
            <div class="steps">
              <div class="step"><span>1</span> ตรวจสอบและนำเข้าข้อมูล 7 ตาราง</div>
              <div class="step"><span>2</span> เลือกเงื่อนไขพิเศษและกดจัดตารางอัตโนมัติ</div>
              <div class="step"><span>3</span> ตรวจดูตารางเรียน สรุปภาระสอนครู และปรับแก้</div>
              <div class="step"><span>4</span> ส่งออก output.csv, Excel, PDF และ QR Code</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  `,
  styles: `
    .kpis {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 14px;
    }
    .kpi {
      padding: 16px 18px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .kpi-label {
      font-size: 13px;
      color: var(--text-muted);
      font-weight: 500;
    }
    .kpi strong {
      font-size: 28px;
      line-height: 1.1;
      color: var(--maroon-700);
    }
    .val-top {
      display: flex;
      align-items: center;
      gap: 20px;
      margin-bottom: 14px;
    }
    .ring-box {
      position: relative;
      width: 80px;
      height: 80px;
      flex-shrink: 0;
    }
    .ring-text {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      line-height: 1.1;
    }
    .ring-text small {
      font-size: 10px;
      color: var(--text-muted);
    }
    .facts {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px 18px;
      font-size: 13px;
    }
    .check-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .ck-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: var(--radius-sm);
      background: var(--bg);
    }
    .ck-icon {
      font-weight: 700;
    }
    .ck-icon.ok {
      color: var(--success);
    }
    .ck-icon.bad {
      color: var(--danger);
    }
    .warn-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .guide-title {
      margin: 18px 0 10px;
    }
    .steps {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .step {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 12px;
      background: var(--bg);
      border-radius: var(--radius-sm);
      font-size: 13.5px;
    }
    .step span {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--maroon-700);
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    @media (max-width: 1100px) {
      .kpis {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `,
})
export class DashboardPage {
  readonly state = inject(AppState);
  private readonly api = inject(Api);
  readonly stats = signal<StatsResponse | null>(null);
  readonly Math = Math;

  readonly passedCount = computed(() => {
    const checks = this.state.timetable()?.validation?.checks || [];
    return checks.filter((c) => c.passed).length;
  });

  constructor() {
    effect(() => {
      this.state.version();
      void this.loadStats();
    });
  }

  async loadStats() {
    try {
      this.stats.set(await this.api.getStats());
    } catch {
      // ignore if empty
    }
  }
}
