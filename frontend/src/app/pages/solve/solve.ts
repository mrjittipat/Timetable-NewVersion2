import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { AuthService } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { BestSeedResponse, Config, DiagnosisResponse, SavedSeed, SolveResponse } from '../../core/models';
import { AppState } from '../../core/state';
import { Toasts } from '../../core/toast';
import { Icon } from '../../shared/icon';

const SPECIAL_DEFS = [
  { id: 'S1', title: 'ภาระสอนหัวหน้าแผนกวิชา (20–30 คาบ)', detail: 'ครูที่เป็นหัวหน้าแผนกวิชา (Leader) สอนอย่างต่ำ 20 คาบ และสูงสุดไม่เกิน 30 คาบ/สัปดาห์' },
  { id: 'S2', title: 'ภาระสอนครูธรรมดา (25–35 คาบ)', detail: 'ครูธรรมดา (Teacher รวมหัวหน้างานทะเบียน) สอนอย่างต่ำ 25 คาบ และสูงสุดไม่เกิน 35 คาบ/สัปดาห์' },
  { id: 'S3', title: 'ตารางเรียนนักเรียนห้ามมีช่องว่าง', detail: 'ทุกวัน จ–ศ จัดช่วงคาบเช้า (คาบ 2–5) ให้เต็มก่อนแล้วค่อยจัดช่วงหลังเที่ยง (คาบ 7–10) โดยไม่มีคาบว่างคั่น (ยกเว้น Homeroom และพักเที่ยง)' },
];

const BASIC_DEFS = [
  { id: 'B1', title: 'คาบ 1 (08:00–08:30) เป็น Homeroom ทั้งวิทยาลัย ห้ามจัดรายวิชาลง' },
  { id: 'B2', title: 'คาบพักเที่ยง (คาบ 6 เวลา 12:30–13:30) ห้ามจัดรายวิชาลง' },
  { id: 'B3', title: 'วันพฤหัสบดี คาบ 2–3 เป็นรายวิชากิจกรรม (ปวช.1 เป็นลูกเสือวิสามัญ)' },
  { id: 'B4', title: 'ครูวุฒิวงศ์สอนเฉพาะ ปวส.1–2 สาขาเทคโนโลยีสารสนเทศเท่านั้น' },
  { id: 'B5', title: 'ครูวุฒิวงศ์สอนกิจกรรม ปวส.1 และ ปวส.2 IT พร้อมกัน พฤหัสบดี คาบ 2–3' },
  { id: 'B6', title: 'ครูลิขิตสอนกิจกรรม ปวช.2 และ ปวช.3 IT พร้อมกัน พฤหัสบดี คาบ 2–3' },
];

@Component({
  selector: 'app-solve-page',
  standalone: true,
  imports: [FormsModule, RouterLink, Icon],
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <div class="eyebrow">ขั้นตอนที่ 2</div>
          <h1>จัดตารางอัตโนมัติ</h1>
          <p class="muted">ตั้งค่าเงื่อนไขพิเศษ พารามิเตอร์อัลกอริทึม และค้นหา Seed ที่ดีที่สุด</p>
        </div>
      </header>

      @if (cfg(); as c) {
        <div class="solve-cols">
          <!-- Left column -->
          <div class="col-stack">
            <section class="card">
              <div class="card-head">
                <div class="row">
                  <h3>เงื่อนไขพิเศษ</h3>
                  <span class="badge">เปิด {{ enabledSpecialCount() }}/{{ specialDefs.length }}</span>
                </div>
                @if (auth.isAdmin()) {
                  <div class="row">
                    <button type="button" class="btn sm" (click)="setAllSpecial(true)">เปิดทั้งหมด</button>
                    <button type="button" class="btn sm" (click)="setAllSpecial(false)">ปิดทั้งหมด</button>
                  </div>
                }
              </div>
              <div class="card-body list-col">
                @for (sp of specialDefs; track sp.id) {
                  <div class="rule-row" [class.on]="c.constraints[sp.id]">
                    <span class="num-tile">{{ sp.id }}</span>
                    <div class="spacer">
                      <strong>{{ sp.title }}</strong>
                      <div class="small muted">{{ sp.detail }}</div>
                    </div>
                    <label class="switch">
                      <input
                        type="checkbox"
                        [checked]="c.constraints[sp.id]"
                        [disabled]="!auth.isAdmin()"
                        (change)="toggleConstraint(sp.id, $any($event.target).checked)"
                      />
                      <span class="track"></span>
                    </label>
                  </div>
                }
              </div>
            </section>

            <section class="card">
              <div class="card-head">
                <h3>เงื่อนไขพื้นฐาน (บังคับ)</h3>
                <span class="badge success">เปิดเสมอ</span>
              </div>
              <div class="card-body list-col">
                @for (b of basicDefs; track b.id) {
                  <div class="basic-row">
                    <span class="num-tile soft">{{ b.id }}</span>
                    <span class="small">{{ b.title }}</span>
                  </div>
                }
              </div>
            </section>

            <section class="card grow-card">
              <div class="card-head">
                <h3>Seed ที่บันทึกไว้</h3>
                <span class="badge neutral">{{ c.savedSeeds.length }}</span>
              </div>
              <div class="card-body">
                @if (c.savedSeeds.length === 0) {
                  <div class="empty small">ยังไม่มี Seed ที่บันทึกไว้</div>
                } @else {
                  <div class="list-col">
                    @for (s of c.savedSeeds; track s.id) {
                      <div class="seed-row">
                        <span class="seed-tile">{{ s.seed }}</span>
                        <div class="spacer">
                          <strong>{{ s.name }}</strong>
                          <div class="small muted">
                            เงื่อนไขพิเศษ {{ enabledKeysText(s.constraints) }} · block {{ s.params['maxBlock'] ?? 4 }} ·
                            {{ s.params['maxPerDay'] ?? 8 }} คาบ/วัน · soft cost {{ s.softCost ?? '-' }}
                          </div>
                          <div class="small muted">{{ formatDate(s.savedAt) }}</div>
                        </div>
                        <button type="button" class="btn sm" (click)="loadSavedSeed(s)">
                          {{ loadedSeedId() === s.id ? 'โหลดแล้ว' : 'Load' }}
                        </button>
                        @if (auth.isAdmin()) {
                          <button type="button" class="btn ghost sm icon" (click)="removeSeed(s)" title="ลบ">
                            <app-icon name="trash" [size]="15" />
                          </button>
                        }
                      </div>
                    }
                  </div>
                }
              </div>
            </section>
          </div>

          <!-- Right column -->
          <div class="col-stack">
            <section class="card">
              <div class="card-head">
                <h3>พารามิเตอร์อัลกอริทึม</h3>
              </div>
              <div class="card-body form-grid">
                <div class="field">
                  <label>Random seed</label>
                  <div class="row">
                    <input class="input" type="number" [(ngModel)]="c.params.seed" [disabled]="!auth.isAdmin()" />
                    @if (auth.isAdmin()) {
                      <button type="button" class="btn sm" (click)="shuffleSeed()">สุ่ม</button>
                    }
                  </div>
                  <span class="hint">Seed เดิม + ข้อมูลเดิม จะได้ตารางเรียนเดิมทุกครั้ง</span>
                </div>

                <div class="field">
                  <label>เวลาสูงสุด (วินาที)</label>
                  <input class="input" type="number" min="1" max="120" [(ngModel)]="c.params.timeLimitSec" [disabled]="!auth.isAdmin()" />
                  <span class="hint">แนะนำ 10–30 วินาที</span>
                </div>

                <div class="field">
                  <label>คาบติดกันสูงสุดต่อบล็อก</label>
                  <input class="input" type="number" min="1" max="8" [(ngModel)]="c.params.maxBlock" [disabled]="!auth.isAdmin()" />
                  <span class="hint">ค่าเริ่มต้น 4 (แบ่ง 5 คาบเป็น 3+2)</span>
                </div>

                <div class="field">
                  <label>คาบสูงสุดต่อวัน</label>
                  <input class="input" type="number" min="4" max="10" [(ngModel)]="c.params.maxPerDay" [disabled]="!auth.isAdmin()" />
                  <span class="hint">คาบเรียนปกติมี 8 คาบ/วัน (ไม่รวม Homeroom และพักเที่ยง)</span>
                </div>
              </div>
            </section>

            <section class="card grow-card">
              <div class="card-head">
                <h3>ข้อมูลหัวกระดาษตาราง</h3>
                @if (auth.isAdmin()) {
                  <button type="button" class="btn primary sm" (click)="saveDoc()" [disabled]="savingDoc()">
                    บันทึก
                  </button>
                }
              </div>
              <div class="card-body doc-grid">
                <div class="field span-2">
                  <label>วิทยาลัย</label>
                  <input class="input" [(ngModel)]="c.document.college" [disabled]="!auth.isAdmin()" />
                </div>
                <div class="field">
                  <label>ภาคเรียน</label>
                  <input class="input" [(ngModel)]="c.document.semester" [disabled]="!auth.isAdmin()" />
                </div>
                <div class="field">
                  <label>ปีการศึกษา</label>
                  <input class="input" [(ngModel)]="c.document.year" [disabled]="!auth.isAdmin()" />
                </div>
                <div class="field">
                  <label>หัวหน้างานพัฒนาหลักสูตร</label>
                  <input class="input" [(ngModel)]="c.document.curriculumHeadName" [disabled]="!auth.isAdmin()" />
                </div>
                <div class="field">
                  <label>รองผู้อำนวยการฝ่ายวิชาการ</label>
                  <input class="input" [(ngModel)]="c.document.deputyName" [disabled]="!auth.isAdmin()" />
                </div>
                <div class="field span-2">
                  <label>ผู้อำนวยการ</label>
                  <input class="input" [(ngModel)]="c.document.directorName" [disabled]="!auth.isAdmin()" />
                </div>
                <div class="field span-2 row">
                  <label class="switch">
                    <input type="checkbox" [(ngModel)]="c.document.publicEnabled" [disabled]="!auth.isAdmin()" />
                    <span class="track"></span>
                  </label>
                  <span>เผยแพร่ตารางสาธารณะ</span>
                </div>
                <div class="field span-2">
                  <label>ที่อยู่สาธารณะสำหรับลิงก์และ QR (ไม่บังคับ)</label>
                  <input class="input" [(ngModel)]="c.document.publicBaseUrl" placeholder="เช่น http://192.168.1.10:3000" [disabled]="!auth.isAdmin()" />
                </div>
              </div>
            </section>
          </div>
        </div>

        <!-- Run row -->
        <div class="solve-cols run-row">
          <section class="card">
            <div class="card-head">
              <h3>ค้นหา seed ที่ดีที่สุด</h3>
              @if (auth.isAdmin()) {
                <div class="row">
                  <select class="input sm-select" [(ngModel)]="bestCount">
                    <option [ngValue]="10">10 seed</option>
                    <option [ngValue]="20">20 seed</option>
                    <option [ngValue]="30">30 seed</option>
                    <option [ngValue]="50">50 seed</option>
                  </select>
                  <button type="button" class="btn" (click)="runBest()" [disabled]="running() || searching()">
                    @if (searching()) {
                      <span class="spinner"></span> กำลังค้นหา…
                    } @else {
                      <app-icon name="search" [size]="16" /> เริ่มค้นหา
                    }
                  </button>
                </div>
              }
            </div>
            <div class="card-body">
              @if (!bestResult()) {
                <p class="muted">
                  <strong>Soft Cost</strong> วัดความสมดุลของการกระจายคาบเรียนในแต่ละวัน (ยิ่งต่ำยิ่งดี)
                  กดปุ่ม <strong>เริ่มค้นหา</strong> เพื่อทดลองหลาย Seed แล้วเลือกค่าที่ดีที่สุดโดยอัตโนมัติ
                </p>
              } @else if (bestResult(); as br) {
                <div class="small muted mb-8">{{ br.message }} (ใช้เวลา {{ br.seconds }} วินาที)</div>
                <div class="table-wrap max-best">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>อันดับ</th>
                        <th>Seed</th>
                        <th>Soft cost</th>
                        <th>เวลา</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (r of br.results; track r.seed; let idx = $index) {
                        <tr>
                          <td>{{ idx + 1 }}</td>
                          <td class="mono">{{ r.seed }}</td>
                          <td>
                            @if (r.ok && r.softCost !== null) {
                              <div class="sc-cell">
                                <span>{{ r.softCost }}</span>
                                <div class="sc-track">
                                  <div class="sc-bar" [style.width.%]="softPct(r.softCost)"></div>
                                </div>
                              </div>
                            } @else {
                              <span class="badge danger">ไม่สำเร็จ</span>
                            }
                          </td>
                          <td>{{ r.seconds }}s</td>
                          <td>
                            @if (c.params.seed === r.seed) {
                              <span class="badge success">ใช้อยู่</span>
                            } @else if (r.ok && auth.isAdmin()) {
                              <button type="button" class="btn sm" (click)="applySeed(r.seed)">ใช้ seed นี้</button>
                            }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </div>
          </section>

          <section class="card">
            <div class="card-head">
              <h3>ดำเนินการจัดตาราง</h3>
            </div>
            <div class="card-body run-card-body">
              <div class="algo-steps">
                <div class="a-step"><strong>1. CSP Search (MRV)</strong> · ค้นหาการจัดวางที่ผ่านทุกเงื่อนไขบังคับ</div>
                <div class="a-step"><strong>2. Simulated Annealing</strong> · ปรับสมดุลตารางลด Soft Cost</div>
                <div class="a-step"><strong>3. Validator อิสระ</strong> · ตรวจซ้ำครบทั้ง 12 ข้อ</div>
              </div>

              @if (auth.isAdmin()) {
                <div class="run-actions">
                  <button type="button" class="btn primary lg" (click)="runSolve()" [disabled]="running() || searching()">
                    @if (running()) {
                      <span class="spinner"></span> กำลังจัดตาราง ({{ elapsed() }} วิ)…
                    } @else {
                      <app-icon name="play" [size]="18" /> เริ่มจัดตาราง
                    }
                  </button>
                  <button type="button" class="btn" (click)="runDiagnose()" [disabled]="diagnosing() || running()">
                    @if (diagnosing()) {
                      <span class="spinner"></span> กำลังวิเคราะห์…
                    } @else {
                      <app-icon name="alert" [size]="17" /> วิเคราะห์สาเหตุ (เมื่อจัดตารางไม่ได้)
                    }
                  </button>
                </div>
              }
            </div>
          </section>
        </div>

        @if (diagResult(); as dr) {
          <section class="card">
            <div class="card-head">
              <h3>ผลวิเคราะห์สาเหตุ</h3>
              <span class="badge" [class.success]="dr.feasible" [class.danger]="!dr.feasible">
                {{ dr.feasible ? 'จัดตารางได้' : 'พบปัญหา' }}
              </span>
            </div>
            <div class="card-body list-col">
              @if (dr.culprits.length) {
                <div class="alert danger">
                  <app-icon name="alert" [size]="18" />
                  <span>เงื่อนไขที่เป็นสาเหตุหลัก: <strong>{{ dr.culprits.join(', ') }}</strong></span>
                </div>
              }
              <div class="row">
                @for (p of dr.probes; track p.label) {
                  <span class="badge" [class.success]="p.ok" [class.danger]="!p.ok">
                    {{ p.ok ? '✓' : '✗' }} {{ p.label }} ({{ p.seconds }}s)
                  </span>
                }
              </div>
              @for (f of dr.findings; track $index) {
                <div class="alert" [class.danger]="f.level === 'error'" [class.warning]="f.level === 'warn'" [class.success]="f.level === 'ok'">
                  <strong>[{{ f.area }}]</strong> {{ f.message }}
                </div>
              }
              @for (s of dr.suggestions; track $index) {
                <div class="small muted">• {{ s }}</div>
              }
            </div>
          </section>
        }

        @if (solveResult(); as sr) {
          <section class="card">
            <div class="card-head">
              <h3>ผลลัพธ์</h3>
              <span class="badge" [class.success]="sr.status === 'success'" [class.danger]="sr.status !== 'success'">
                {{ sr.message }}
              </span>
            </div>
            <div class="card-body list-col">
              @if (sr.status === 'success') {
                <div class="stats-8">
                  <div class="s8"><span>แถว output</span><strong>{{ sr.rows.length }}</strong></div>
                  <div class="s8"><span>บล็อกที่จัด</span><strong>{{ sr.stats.blocks }}</strong></div>
                  <div class="s8"><span>รอบค้นหา</span><strong>{{ sr.stats.restarts }}</strong></div>
                  <div class="s8"><span>Node ที่สำรวจ</span><strong>{{ sr.stats.nodes }}</strong></div>
                  <div class="s8"><span>SA iterations</span><strong>{{ sr.stats.saIterations }}</strong></div>
                  <div class="s8"><span>Soft cost</span><strong>{{ sr.stats.softCostBefore }} → {{ sr.stats.softCostAfter }}</strong></div>
                  <div class="s8"><span>เวลาที่ใช้</span><strong>{{ sr.stats.seconds }}s</strong></div>
                  <div class="s8">
                    <span>Validator</span>
                    <strong [style.color]="sr.validation?.passed ? 'var(--success)' : 'var(--danger)'">
                      {{ sr.validation?.passed ? 'ผ่านทุกข้อ' : 'ไม่ผ่าน' }}
                    </strong>
                  </div>
                </div>
                <div class="row">
                  <a class="btn primary sm" routerLink="/timetable">ดูตารางเรียน →</a>
                  <a class="btn sm" routerLink="/teacher-summary">ดูสรุปภาระสอนครู →</a>
                  <a class="btn sm" routerLink="/report">ดูผลตรวจเงื่อนไข →</a>
                </div>
              } @else {
                @for (e of sr.errors || []; track $index) {
                  <div class="alert danger">{{ e }}</div>
                }
              }

              @if (sr.warnings?.length) {
                <details>
                  <summary class="small muted">ข้อสังเกตจากข้อมูล ({{ sr.warnings.length }})</summary>
                  <ul>
                    @for (w of sr.warnings; track $index) {
                      <li class="small">{{ w.message }}</li>
                    }
                  </ul>
                </details>
              }
            </div>
          </section>
        }
      }
    </div>
  `,
  styles: `
    .solve-cols {
      display: grid;
      grid-template-columns: 1.1fr 1fr;
      gap: 18px;
      align-items: stretch;
    }
    .col-stack {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .grow-card {
      flex: 1 1 auto;
    }
    .list-col {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .rule-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }
    .rule-row.on {
      background: var(--maroon-50);
      border-color: var(--maroon-200);
    }
    .basic-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 8px;
      border-radius: var(--radius-sm);
      background: var(--bg);
    }
    .num-tile {
      width: 34px;
      height: 28px;
      border-radius: var(--radius-sm);
      background: var(--maroon-700);
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .num-tile.soft {
      background: var(--maroon-100);
      color: var(--maroon-800);
    }
    .seed-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }
    .seed-tile {
      min-width: 54px;
      padding: 6px 8px;
      border-radius: var(--radius-sm);
      background: var(--maroon-50);
      color: var(--maroon-800);
      font-weight: 700;
      text-align: center;
    }
    .form-grid,
    .doc-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .span-2 {
      grid-column: span 2;
    }
    .sm-select {
      width: 110px;
      min-height: 32px;
    }
    .max-best {
      max-height: 250px;
      overflow-y: auto;
    }
    .sc-cell {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .sc-track {
      width: 72px;
      height: 6px;
      border-radius: 999px;
      background: var(--maroon-100);
      overflow: hidden;
    }
    .sc-bar {
      height: 100%;
      background: var(--maroon-700);
    }
    .run-card-body {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 16px;
    }
    .algo-steps {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .a-step {
      padding: 8px 12px;
      border-radius: var(--radius-sm);
      background: var(--bg);
      font-size: 13px;
    }
    .run-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .stats-8 {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }
    .s8 {
      padding: 10px 12px;
      border-radius: var(--radius);
      background: var(--bg);
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .s8 span {
      font-size: 12px;
      color: var(--text-muted);
    }
    .s8 strong {
      font-size: 16px;
    }
    .mb-8 {
      margin-bottom: 8px;
    }
    @media (max-width: 960px) {
      .solve-cols,
      .stats-8 {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class SolvePage implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  private readonly api = inject(Api);
  private readonly state = inject(AppState);
  private readonly toasts = inject(Toasts);
  private readonly confirm = inject(Confirm);

  readonly specialDefs = SPECIAL_DEFS;
  readonly basicDefs = BASIC_DEFS;
  readonly cfg = signal<Config | null>(null);
  readonly loadedSeedId = signal('');
  readonly bestCount = signal(20);
  readonly running = signal(false);
  readonly searching = signal(false);
  readonly diagnosing = signal(false);
  readonly savingDoc = signal(false);
  readonly elapsed = signal(0);
  readonly solveResult = signal<SolveResponse | null>(null);
  readonly bestResult = signal<BestSeedResponse | null>(null);
  readonly diagResult = signal<DiagnosisResponse | null>(null);

  private timerHandle: ReturnType<typeof setInterval> | null = null;

  readonly enabledSpecialCount = computed(() => {
    const c = this.cfg()?.constraints || {};
    return SPECIAL_DEFS.filter((d) => c[d.id]).length;
  });

  async ngOnInit() {
    try {
      const res = await this.api.getConfig();
      this.cfg.set(res.config);
    } catch (err) {
      this.toasts.error(this.api.errorMessage(err));
    }
  }

  ngOnDestroy() {
    if (this.timerHandle) clearInterval(this.timerHandle);
  }

  toggleConstraint(id: string, val: boolean) {
    this.cfg.update((c) => (c ? { ...c, constraints: { ...c.constraints, [id]: val } } : c));
  }

  setAllSpecial(val: boolean) {
    this.cfg.update((c) => {
      if (!c) return c;
      const next = { ...c.constraints };
      for (const d of SPECIAL_DEFS) next[d.id] = val;
      return { ...c, constraints: next };
    });
  }

  shuffleSeed() {
    const s = Math.floor(Math.random() * 99999) + 1;
    this.cfg.update((c) => (c ? { ...c, params: { ...c.params, seed: s } } : c));
  }

  enabledKeysText(cs: Record<string, boolean> = {}) {
    const keys = Object.entries(cs)
      .filter(([, v]) => v)
      .map(([k]) => k);
    return keys.length ? keys.join(', ') : 'ปิดหมด';
  }

  formatDate(iso: string) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('th-TH');
  }

  loadSavedSeed(s: SavedSeed) {
    this.cfg.update((c) =>
      c
        ? {
            ...c,
            constraints: { ...c.constraints, ...s.constraints },
            params: { ...c.params, ...s.params, seed: s.seed },
          }
        : c
    );
    this.loadedSeedId.set(s.id);
    this.toasts.info(`โหลด Seed ${s.seed} แล้ว`);
  }

  async removeSeed(s: SavedSeed) {
    const ok = await this.confirm.ask({
      title: 'ลบ Seed ที่บันทึก',
      message: `ต้องการลบ "${s.name}" (Seed ${s.seed}) ใช่หรือไม่?`,
      confirmLabel: 'ลบ',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await this.api.deleteSeed(s.id);
      this.cfg.update((c) => (c ? { ...c, savedSeeds: res.savedSeeds } : c));
      this.toasts.success('ลบ Seed เรียบร้อย');
    } catch (err) {
      this.toasts.error(this.api.errorMessage(err));
    }
  }

  async saveDoc() {
    const c = this.cfg();
    if (!c) return;
    this.savingDoc.set(true);
    try {
      const res = await this.api.saveConfig(c);
      this.cfg.set(res.config);
      this.toasts.success('บันทึกการตั้งค่าเรียบร้อย');
    } catch (err) {
      this.toasts.error(this.api.errorMessage(err));
    } finally {
      this.savingDoc.set(false);
    }
  }

  async runSolve() {
    const c = this.cfg();
    if (!c || this.running()) return;
    this.running.set(true);
    this.elapsed.set(0);
    const t0 = Date.now();
    this.timerHandle = setInterval(() => this.elapsed.set(Math.floor((Date.now() - t0) / 1000)), 250);
    try {
      const res = await this.api.solve({ constraints: c.constraints, params: c.params, document: c.document });
      this.solveResult.set(res);
      await this.state.refresh();
      if (res.status === 'success') this.toasts.success(res.message);
      else this.toasts.error(res.message);
    } catch (err) {
      this.toasts.error(this.api.errorMessage(err));
    } finally {
      if (this.timerHandle) clearInterval(this.timerHandle);
      this.timerHandle = null;
      this.running.set(false);
    }
  }

  async runBest() {
    const c = this.cfg();
    if (!c || this.searching()) return;
    this.searching.set(true);
    try {
      await this.api.saveConfig(c);
      const res = await this.api.bestSeed(this.bestCount());
      this.bestResult.set(res);
      if (res.best) {
        this.cfg.update((x) => (x ? { ...x, params: { ...x.params, seed: res.best!.seed } } : x));
        await this.state.refresh();
        this.toasts.success(res.message);
      } else {
        this.toasts.error(res.message);
      }
    } catch (err) {
      this.toasts.error(this.api.errorMessage(err));
    } finally {
      this.searching.set(false);
    }
  }

  async applySeed(seed: number) {
    this.cfg.update((x) => (x ? { ...x, params: { ...x.params, seed } } : x));
    await this.runSolve();
  }

  async runDiagnose() {
    const c = this.cfg();
    if (!c || this.diagnosing()) return;
    this.diagnosing.set(true);
    try {
      const res = await this.api.diagnose({ constraints: c.constraints, params: c.params });
      this.diagResult.set(res);
    } catch (err) {
      this.toasts.error(this.api.errorMessage(err));
    } finally {
      this.diagnosing.set(false);
    }
  }

  softPct(val: number) {
    const max = Math.max(1, ...(this.bestResult()?.results.map((r) => r.softCost || 0) || [100]));
    return Math.min(100, Math.round((val / max) * 100));
  }
}
