import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { AuthService } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { EntityRef, Grid, GridSpan, OutputRow, View } from '../../core/models';
import { AppState } from '../../core/state';
import { Toasts } from '../../core/toast';
import { Icon } from '../../shared/icon';
import { PdfPreview } from '../../shared/pdf-preview';
import { SpanDropEvent, SpanSelectEvent, TimetableSheet } from './sheet';

@Component({
  selector: 'app-timetable-page',
  standalone: true,
  imports: [FormsModule, RouterLink, Icon, PdfPreview, TimetableSheet],
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <div class="eyebrow">ขั้นตอนที่ 3</div>
          <h1>ตารางเรียน</h1>
          <p class="muted">ตรวจสอบ ย้าย/สลับคาบเรียนด้วยตนเอง และส่งออกเป็นเอกสาร</p>
        </div>
        <div class="actions">
          @if (auth.isAdmin()) {
            <button type="button" class="btn" [disabled]="undoStack().length === 0 || busy()" (click)="undo()">
              <app-icon name="undo" [size]="16" /> ย้อนกลับ ({{ undoStack().length }})
            </button>
          }
          <button type="button" class="btn" [disabled]="!state.hasTimetable()" (click)="openShare()">
            <app-icon name="external" [size]="16" /> แชร์ / QR
          </button>
          <a class="btn" [class.disabled]="!state.hasTimetable()" [href]="excelHref()" target="_blank">
            <app-icon name="sheet" [size]="16" /> Excel
          </a>
          <button type="button" class="btn primary" [disabled]="!state.hasTimetable()" (click)="openPdf()">
            <app-icon name="file" [size]="16" /> PDF / พิมพ์
          </button>
        </div>
      </header>

      <!-- Controls -->
      <section class="card">
        <div class="card-body ctrl-row">
          <div class="segmented">
            <button type="button" [class.active]="curView() === 'group'" (click)="switchView('group')">กลุ่มเรียน</button>
            <button type="button" [class.active]="curView() === 'teacher'" (click)="switchView('teacher')">ครูผู้สอน</button>
            <button type="button" [class.active]="curView() === 'room'" (click)="switchView('room')">ห้องเรียน</button>
          </div>

          <div class="row entity-nav">
            <button type="button" class="btn sm icon" (click)="stepEntity(-1)" [disabled]="!curId()">‹</button>
            <select class="input entity-select" [ngModel]="curId()" (ngModelChange)="selectEntity($event)">
              <option value="">— แสดงทั้งหมด ({{ viewAllLabel() }}) —</option>
              @for (e of currentEntities(); track e.id) {
                <option [value]="e.id">{{ e.title }}</option>
              }
            </select>
            <button type="button" class="btn sm icon" (click)="stepEntity(1)" [disabled]="!curId()">›</button>
          </div>

          <span class="spacer"></span>

          @if (state.timetable()?.validation; as v) {
            @if (v.passed) {
              <span class="badge success">ผ่านทุกเงื่อนไข</span>
            } @else {
              <a class="badge danger" routerLink="/report">ไม่ผ่าน {{ failedCheckCount() }} เงื่อนไข</a>
            }
          }
        </div>
      </section>

      <!-- Seed bar -->
      @if (state.hasTimetable()) {
        <section class="card">
          <div class="card-body seed-bar">
            @if (state.timetable()?.meta?.stats; as st) {
              <span class="muted">Seed ที่ใช้สร้างตารางนี้:</span>
              <span class="badge">{{ st.seed }}</span>
              <span class="small muted">
                เงื่อนไขพิเศษ {{ enabledSpecialText(st.constraints) }} ·
                คาบติดกันสูงสุด {{ st.params['maxBlock'] ?? 4 }} ·
                คาบสูงสุด/วัน {{ st.params['maxPerDay'] ?? 8 }} ·
                Soft cost {{ st.softCostAfter }}
              </span>
              @if (state.timetable()?.meta?.source === 'manual') {
                <span class="badge warning">มีการแก้ไขด้วยมือหลังจัด</span>
              }
              <span class="spacer"></span>
              @if (auth.isAdmin()) {
                <button type="button" class="btn sm" [disabled]="seedSaved()" (click)="saveCurrentSeed()">
                  {{ seedSaved() ? 'บันทึก seed นี้แล้ว' : 'บันทึก seed' }}
                </button>
              }
            } @else {
              <span class="small muted">ตารางนี้ไม่ได้สร้างจากอัลกอริทึมโดยตรง จึงไม่มีค่า seed</span>
            }
          </div>
        </section>
      }

      <!-- Content -->
      @if (state.loading() && !state.timetable()) {
        <div class="card card-body row muted"><span class="spinner"></span> กำลังโหลดตาราง…</div>
      } @else if (!state.hasTimetable()) {
        <section class="card card-body empty">
          <app-icon name="calendar" [size]="34" />
          <h3>ยังไม่มีตารางเรียนในระบบ</h3>
          <p class="muted">ไปที่หน้าจัดตารางอัตโนมัติเพื่อสร้างตารางเรียนใหม่</p>
          <a class="btn primary" routerLink="/solve">ไปหน้าจัดตารางอัตโนมัติ</a>
        </section>
      } @else {
        @if (curId() === '') {
          @for (g of allGrids(); track g.entity?.id) {
            <section class="card">
              <div class="card-head">
                <div>
                  <h3>{{ g.entity?.title }}</h3>
                  <div class="small muted">{{ g.entity?.subtitle }}</div>
                </div>
                <span class="badge neutral">{{ g.total }} คาบ/สัปดาห์</span>
              </div>
              <div class="card-body">
                <app-timetable-sheet
                  [grid]="g"
                  [view]="curView()"
                  [editable]="auth.isAdmin()"
                  (spanSelect)="onSelectSpan($event, g.entity?.id || '')"
                  (spanMove)="onMoveSpan($event, g.entity?.id || '')"
                />
              </div>
            </section>
          }
        } @else if (singleGrid(); as g) {
          <section class="card">
            <div class="card-head">
              <div>
                <h3>{{ g.entity?.title }}</h3>
                <div class="small muted">{{ g.entity?.subtitle }}</div>
              </div>
              <span class="badge neutral">{{ g.total }} คาบ/สัปดาห์</span>
            </div>
            <div class="card-body">
              <app-timetable-sheet
                [grid]="g"
                [view]="curView()"
                [editable]="auth.isAdmin()"
                (spanSelect)="onSelectSpan($event, g.entity?.id || '')"
                (spanMove)="onMoveSpan($event, g.entity?.id || '')"
              />
            </div>
          </section>
        }
      }
    </div>

    <!-- Side panel: รายละเอียดคาบ -->
    @if (selected(); as sel) {
      <div class="scrim" (click)="selected.set(null)">
        <aside class="panel" (click)="$event.stopPropagation()">
          <div class="dialog-head">
            <h3>รายละเอียดคาบ</h3>
            <button type="button" class="btn ghost sm icon" (click)="selected.set(null)">
              <app-icon name="x" [size]="17" />
            </button>
          </div>
          <div class="dialog-body">
            <div>
              <div class="eyebrow">{{ sel.span.subject_id }}</div>
              <h3>{{ sel.span.subject_name }}</h3>
            </div>
            <div class="info-list">
              <div>
                <span class="muted">วัน/คาบ:</span> {{ sel.dayLabel }} คาบ {{ sel.span.start }}@if (sel.span.span > 1) {-{{ sel.span.start + sel.span.span - 1 }}} ({{ sel.span.span }} คาบ)
              </div>
              <div><span class="muted">กลุ่มเรียน:</span> {{ sel.span.groups.join(', ') }}</div>
              <div><span class="muted">ครูผู้สอน:</span> {{ sel.span.teacher }}</div>
              <div><span class="muted">ห้องเรียน:</span> {{ sel.span.room }}</div>
            </div>

            @if (auth.isAdmin()) {
              <hr />
              <div class="edit-sec">
                <h4>ย้ายไปช่วงเวลาอื่น</h4>
                <div class="grid-2">
                  <div class="field">
                    <label>วัน</label>
                    <select class="input" [(ngModel)]="moveDay">
                      @for (d of dayOptions(); track d.key) {
                        <option [value]="d.key">{{ d.label }}</option>
                      }
                    </select>
                  </div>
                  <div class="field">
                    <label>คาบเริ่มต้น</label>
                    <select class="input" [(ngModel)]="movePeriod">
                      @for (p of usablePeriodOptions(); track p) {
                        <option [ngValue]="p">คาบ {{ p }}</option>
                      }
                    </select>
                  </div>
                </div>
                <button type="button" class="btn primary sm" (click)="submitMovePanel()" [disabled]="busy()">
                  ย้ายคาบ
                </button>
              </div>

              <hr />
              <div class="edit-sec">
                <h4>เปลี่ยนครูหรือห้อง</h4>
                <div class="field">
                  <label>ครูผู้สอน</label>
                  <select class="input" [(ngModel)]="editTeacher">
                    @for (t of teacherOptionsForSelected(); track t['teacher_id']) {
                      <option [value]="t['teacher_id']">{{ t['teacher_id'] }} {{ t['teacher_name'] }}</option>
                    }
                  </select>
                </div>
                <div class="field">
                  <label>ห้องเรียน</label>
                  <select class="input" [(ngModel)]="editRoom">
                    @for (r of state.data()?.data?.['room'] || []; track r['room_id']) {
                      <option [value]="r['room_id']">{{ r['room_id'] }} {{ r['room_name'] }}</option>
                    }
                  </select>
                </div>
                <button type="button" class="btn sm" (click)="submitEditPanel()" [disabled]="busy()">
                  บันทึกการเปลี่ยนครู/ห้อง
                </button>
              </div>
            }
          </div>
        </aside>
      </div>
    }

    <!-- Share dialog -->
    @if (shareInfo(); as sh) {
      <div class="scrim" (click)="shareInfo.set(null)">
        <div class="dialog" (click)="$event.stopPropagation()">
          <div class="dialog-head">
            <h3>แชร์ / QR Code ตารางเรียน</h3>
            <button type="button" class="btn ghost sm icon" (click)="shareInfo.set(null)">
              <app-icon name="x" [size]="17" />
            </button>
          </div>
          <div class="dialog-body center-col">
            <img [src]="qrImgUrl()" alt="QR Code" width="200" height="200" />
            <div class="row w-full">
              <input class="input mono small" [value]="sh.url" readonly />
              <button type="button" class="btn sm" (click)="copyShareUrl(sh.url)">คัดลอก</button>
            </div>
            @if (!sh.enabled) {
              <div class="alert warning w-full">การเผยแพร่ตารางสาธารณะถูกปิดอยู่ สามารถเปิดได้ที่หน้าจัดตารางอัตโนมัติ</div>
            } @else if (sh.url.includes('localhost') || sh.url.includes('127.0.0.1')) {
              <div class="alert info w-full">URL เป็น localhost หากแชร์ให้ผู้อื่นสแกนควรตั้งค่าที่อยู่สาธารณะในหน้าจัดตารางอัตโนมัติ</div>
            }
          </div>
          <div class="dialog-foot">
            <a class="btn" [routerLink]="['/p', curView(), effectiveId()]" (click)="shareInfo.set(null)">เปิดดู</a>
            <button type="button" class="btn primary" (click)="openQrPdf()">พิมพ์ QR ทุก{{ viewUnitLabel() }}</button>
          </div>
        </div>
      </div>
    }

    <app-pdf-preview [url]="pdfUrl()" (closed)="pdfUrl.set(null)" />
  `,
  styles: `
    .ctrl-row {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .entity-nav {
      min-width: 280px;
    }
    .entity-select {
      width: min(360px, 60vw);
    }
    .seed-bar {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      padding: 12px 18px;
    }
    .panel {
      width: min(440px, 100%);
      max-height: 90vh;
      overflow: auto;
      background: var(--surface);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      border: 1px solid var(--border);
    }
    .info-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 13.5px;
    }
    .edit-sec {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    hr {
      border: none;
      border-top: 1px solid var(--border);
      width: 100%;
      margin: 2px 0;
    }
    .center-col {
      align-items: center;
    }
    .w-full {
      width: 100%;
    }
    a.disabled {
      pointer-events: none;
      opacity: 0.55;
    }
  `,
})
export class TimetablePage {
  readonly state = inject(AppState);
  readonly auth = inject(AuthService);
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);
  private readonly confirm = inject(Confirm);

  readonly viewInput = input<string>('', { alias: 'view' });
  readonly idInput = input<string>('', { alias: 'id' });

  readonly curView = signal<View>('group');
  readonly curId = signal<string>('');
  readonly entities = signal<Record<View, EntityRef[]>>({ group: [], teacher: [], room: [] });
  readonly singleGrid = signal<Grid | null>(null);
  readonly allGrids = signal<Grid[]>([]);
  readonly undoStack = signal<OutputRow[][]>([]);
  readonly savedSigs = signal<string[]>([]);
  readonly pdfUrl = signal<string | null>(null);
  readonly shareInfo = signal<{ url: string; base: string; enabled: boolean } | null>(null);
  readonly busy = signal(false);

  readonly selected = signal<{ day: string; dayLabel: string; span: GridSpan; entityId: string } | null>(null);
  moveDay = 'Mon';
  movePeriod = 2;
  editTeacher = '';
  editRoom = '';

  readonly currentEntities = computed(() => this.entities()[this.curView()] || []);
  readonly effectiveId = computed(() => this.curId() || this.currentEntities()[0]?.id || 'G01');
  readonly viewAllLabel = computed(() =>
    this.curView() === 'group' ? 'ทุกกลุ่มเรียน' : this.curView() === 'teacher' ? 'ครูทุกคน' : 'ทุกห้อง'
  );
  readonly viewUnitLabel = computed(() =>
    this.curView() === 'group' ? 'กลุ่มเรียน' : this.curView() === 'teacher' ? 'ครู' : 'ห้อง'
  );
  readonly failedCheckCount = computed(() =>
    (this.state.timetable()?.validation?.checks || []).filter((c) => !c.passed).length
  );

  readonly seedSaved = computed(() => {
    const st = this.state.timetable()?.meta?.stats;
    if (!st) return false;
    const sig = JSON.stringify({
      seed: st.seed,
      constraints: st.constraints,
      maxBlock: st.params?.['maxBlock'],
      maxPerDay: st.params?.['maxPerDay'],
    });
    return this.savedSigs().includes(sig);
  });

  readonly dayOptions = computed(() => this.singleGrid()?.days || this.allGrids()[0]?.days || []);
  readonly usablePeriodOptions = computed(() => {
    const ps = this.singleGrid()?.periods || this.allGrids()[0]?.periods || [];
    return ps.filter((p) => !p.isBreak && !p.isHomeroom).map((p) => p.period);
  });

  readonly teacherOptionsForSelected = computed(() => {
    const sel = this.selected();
    const allTeachers = this.state.data()?.data?.['teacher'] || [];
    if (!sel) return allTeachers;
    const sids = new Set(sel.span.subject_id.split(' / ').map((s) => s.trim()));
    const teachRows = this.state.data()?.data?.['teach'] || [];
    const allowed = new Set(
      teachRows.filter((r) => sids.has(String(r['subject_id']))).map((r) => String(r['teacher_id']))
    );
    allowed.add(sel.span.teacher_id);
    return allTeachers.filter((t) => allowed.has(String(t['teacher_id'])));
  });

  constructor() {
    effect(() => {
      const vi = this.viewInput();
      const ii = this.idInput();
      const v: View = vi === 'teacher' || vi === 'room' ? vi : 'group';
      this.curView.set(v);
      this.curId.set(ii || '');
    });

    effect(() => {
      this.state.version();
      void this.loadEntitiesAndSeeds();
    });

    effect(() => {
      const v = this.curView();
      const id = this.curId();
      this.state.version();
      if (this.state.hasTimetable()) {
        void this.loadGridData(v, id);
      }
    });
  }

  async loadEntitiesAndSeeds() {
    try {
      const [ents, cfg] = await Promise.all([this.api.getEntities(), this.api.getConfig()]);
      this.entities.set(ents);
      this.savedSigs.set(
        cfg.config.savedSeeds.map((s) =>
          JSON.stringify({
            seed: s.seed,
            constraints: s.constraints,
            maxBlock: s.params?.['maxBlock'],
            maxPerDay: s.params?.['maxPerDay'],
          })
        )
      );
      if (!this.curId() && !this.idInput() && ents[this.curView()]?.length) {
        // default to first entity unless user explicitly selected show-all
        if (!this.explicitAll) this.curId.set(ents[this.curView()][0].id);
      }
    } catch {
      // ignore
    }
  }

  private explicitAll = false;

  async loadGridData(view: View, id: string) {
    try {
      if (id === '') {
        const res = await this.api.getGrids(view);
        this.allGrids.set(res.grids);
        this.singleGrid.set(null);
      } else {
        const g = await this.api.getGrid(view, id);
        this.singleGrid.set(g);
        this.allGrids.set([]);
      }
    } catch (err) {
      this.toasts.error(this.api.errorMessage(err));
    }
  }

  switchView(v: View) {
    this.explicitAll = false;
    const first = this.entities()[v]?.[0]?.id || '';
    void this.router.navigate([], { queryParams: { view: v, id: first }, replaceUrl: true });
  }

  selectEntity(id: string) {
    this.explicitAll = id === '';
    this.curId.set(id);
    void this.router.navigate([], { queryParams: { view: this.curView(), id }, replaceUrl: true });
  }

  stepEntity(delta: number) {
    const list = this.currentEntities();
    if (!list.length) return;
    const idx = list.findIndex((e) => e.id === this.curId());
    const nextIdx = (idx + delta + list.length) % list.length;
    this.selectEntity(list[nextIdx].id);
  }

  enabledSpecialText(cs: Record<string, boolean> = {}) {
    const list = Object.entries(cs)
      .filter(([, v]) => v)
      .map(([k]) => k);
    return list.length ? list.join(', ') : 'ปิดหมด';
  }

  private pushUndo() {
    const rows = this.state.timetable()?.rows || [];
    this.undoStack.update((st) => [...st, rows.map((r) => ({ ...r }))].slice(-20));
  }

  async undo() {
    const stack = this.undoStack();
    if (!stack.length || this.busy()) return;
    const prev = stack[stack.length - 1];
    this.undoStack.set(stack.slice(0, -1));
    this.busy.set(true);
    try {
      await this.api.saveTimetable(prev);
      await this.state.refreshTimetable();
      this.state.bump();
      this.toasts.info('ย้อนกลับเรียบร้อย');
    } catch (err) {
      this.toasts.error(this.api.errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  async onMoveSpan(ev: SpanDropEvent, entityId: string) {
    if (!this.auth.isAdmin() || this.busy()) return;
    this.pushUndo();
    this.busy.set(true);
    try {
      await this.api.moveSpan({ view: this.curView(), id: entityId, ...ev });
      await this.state.refreshTimetable();
      this.state.bump();
      this.toasts.success('ย้ายคาบเรียนแล้ว');
    } catch (err) {
      this.undoStack.update((st) => st.slice(0, -1));
      this.toasts.error(this.api.errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  onSelectSpan(ev: SpanSelectEvent, entityId: string) {
    this.selected.set({ ...ev, entityId });
    this.moveDay = ev.day;
    this.movePeriod = ev.span.start;
    this.editTeacher = ev.span.teacher_id;
    this.editRoom = ev.span.room;
  }

  async submitMovePanel() {
    const sel = this.selected();
    if (!sel || this.busy()) return;
    await this.onMoveSpan(
      {
        fromDay: sel.day,
        fromPeriod: sel.span.start,
        length: sel.span.span,
        toDay: this.moveDay,
        toPeriod: this.movePeriod,
      },
      sel.entityId
    );
    this.selected.set(null);
  }

  async submitEditPanel() {
    const sel = this.selected();
    if (!sel || this.busy()) return;
    this.pushUndo();
    this.busy.set(true);
    try {
      await this.api.editSpan({
        view: this.curView(),
        id: sel.entityId,
        day: sel.day,
        period: sel.span.start,
        length: sel.span.span,
        teacher_id: this.editTeacher,
        room_id: this.editRoom,
      });
      this.selected.set(null);
      await this.state.refreshTimetable();
      this.state.bump();
      this.toasts.success('อัปเดตครู/ห้องเรียนเรียบร้อย');
    } catch (err) {
      this.undoStack.update((st) => st.slice(0, -1));
      this.toasts.error(this.api.errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  async saveCurrentSeed() {
    const st = this.state.timetable()?.meta?.stats;
    if (!st) return;
    const defList = this.enabledSpecialText(st.constraints);
    const name = await this.confirm.prompt({
      title: 'บันทึก Seed',
      message: 'ตั้งชื่อสำหรับเก็บ Seed และชุดเงื่อนไขนี้ไว้ใช้ภายหลัง',
      inputLabel: 'ชื่อ Seed',
      defaultValue: `Seed ${st.seed} · เงื่อนไข ${defList}`,
    });
    if (name === null) return;
    try {
      await this.api.addSeed({
        name: name.trim() || `Seed ${st.seed}`,
        seed: st.seed,
        constraints: st.constraints,
        params: st.params,
        softCost: st.softCostAfter,
      });
      await this.loadEntitiesAndSeeds();
      this.toasts.success('บันทึก seed เรียบร้อย');
    } catch (err) {
      this.toasts.error(this.api.errorMessage(err));
    }
  }

  excelHref() {
    return this.api.exportUrl('xlsx', this.curId() ? this.curView() : 'all', this.curId() || undefined, false);
  }

  openPdf() {
    this.pdfUrl.set(this.api.exportUrl('pdf', this.curId() ? this.curView() : 'all', this.curId() || undefined, true));
  }

  async openShare() {
    try {
      this.shareInfo.set(await this.api.getShare(this.curView(), this.effectiveId()));
    } catch (err) {
      this.toasts.error(this.api.errorMessage(err));
    }
  }

  qrImgUrl() {
    return `/api/public/qr?view=${encodeURIComponent(this.curView())}&id=${encodeURIComponent(this.effectiveId())}`;
  }

  async copyShareUrl(url: string) {
    await navigator.clipboard.writeText(url);
    this.toasts.success('คัดลอกลิงก์แล้ว');
  }

  openQrPdf() {
    this.shareInfo.set(null);
    this.pdfUrl.set(this.api.exportUrl('qr-pdf', this.curView(), undefined, true));
  }
}
