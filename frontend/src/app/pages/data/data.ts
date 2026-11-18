import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../core/api';
import { AuthService } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { AppState } from '../../core/state';
import { Toasts } from '../../core/toast';
import { Icon } from '../../shared/icon';

interface TabDef {
  key: string;
  label: string;
  icon: string;
}

const TABS: TabDef[] = [
  { key: 'teacher', label: 'ครูผู้สอน', icon: 'user' },
  { key: 'room', label: 'ห้องเรียน', icon: 'door' },
  { key: 'student_group', label: 'กลุ่มเรียน', icon: 'users' },
  { key: 'subject', label: 'รายวิชา', icon: 'book' },
  { key: 'teach', label: 'สิทธิ์การสอน', icon: 'layers' },
  { key: 'timeslot', label: 'คาบเวลา', icon: 'clock' },
  { key: 'register', label: 'ลงทะเบียนเรียน', icon: 'sheet' },
];

const FIELD_LABELS: Record<string, string> = {
  teacher_id: 'รหัสครู',
  teacher_name: 'ชื่อครู',
  role: 'ตำแหน่ง',
  department: 'สาขาวิชา',
  special_role: 'หน้าที่พิเศษ',
  room_id: 'รหัสห้อง',
  room_name: 'ชื่อห้อง',
  room_type: 'ประเภทห้อง',
  group_id: 'รหัสกลุ่ม',
  group_name: 'ชื่อกลุ่ม',
  student_count: 'จำนวนนักเรียน',
  advisor: 'ครูที่ปรึกษา',
  level: 'ระดับ',
  year: 'ชั้นปี',
  subject_id: 'รหัสวิชา',
  subject_name: 'ชื่อวิชา',
  theory: 'ทฤษฎี (คาบ)',
  practice: 'ปฏิบัติ (คาบ)',
  credit: 'หน่วยกิต',
  hours: 'คาบเรียน/สัปดาห์',
  timeslot_id: 'รหัสคาบ',
  day: 'วัน',
  period: 'คาบที่',
  start: 'เริ่ม',
  end: 'สิ้นสุด',
};

@Component({
  selector: 'app-data-page',
  standalone: true,
  imports: [FormsModule, Icon],
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <div class="eyebrow">ข้อมูลตั้งต้น 7 ไฟล์</div>
          <h1>จัดการข้อมูล</h1>
          <p class="muted">นำเข้าไฟล์ CSV/XLSX และแก้ไขข้อมูลครู ห้อง กลุ่มเรียน รายวิชา และคาบเวลา</p>
        </div>
        @if (auth.isAdmin()) {
          <div class="actions">
            <button type="button" class="btn danger" (click)="resetData()" [disabled]="busy()">
              <app-icon name="refresh" [size]="16" /> คืนค่าข้อมูลต้นฉบับ
            </button>
          </div>
        }
      </header>

      @if (auth.isAdmin()) {
        <div
          class="dropzone"
          [class.over]="dragOver()"
          (dragover)="onDragOver($event)"
          (dragleave)="dragOver.set(false)"
          (drop)="onDrop($event)"
          (click)="fileInput.click()"
        >
          <input #fileInput type="file" hidden multiple accept=".csv,.xlsx" (change)="onFileChange($event)" />
          <app-icon name="upload" [size]="28" />
          <strong>ลากไฟล์มาวาง หรือคลิกเพื่อเลือกไฟล์</strong>
          <span class="small muted">รองรับไฟล์ .csv (7 ตาราง) หรือ .xlsx (รวมถึง ข้อมูลการสอน.xlsx)</span>
        </div>
      }

      @if (state.data(); as d) {
        <section class="card">
          <div class="tabs-bar">
            @for (tab of tabs; track tab.key) {
              <button type="button" class="tab-btn" [class.active]="activeTab() === tab.key" (click)="selectTab(tab.key)">
                <app-icon [name]="tab.icon" [size]="16" />
                <span>{{ tab.label }}</span>
                <span class="badge neutral">{{ (d.data[tab.key] || []).length }}</span>
              </button>
            }
          </div>

          <div class="card-head">
            <div class="search-wrap">
              <app-icon name="search" [size]="16" />
              <input class="input" [(ngModel)]="search" placeholder="ค้นหา…" />
            </div>
            <span class="small muted">แสดง {{ filteredRows().length }} จาก {{ totalRows().length }} แถว</span>
            <span class="spacer"></span>
            @if (auth.isAdmin()) {
              <button type="button" class="btn primary sm" (click)="openAdd()">
                <app-icon name="plus" [size]="16" /> เพิ่มข้อมูล
              </button>
            }
          </div>

          <div class="table-wrap max-t">
            <table class="table">
              <thead>
                <tr>
                  @for (f of currentSchema().fields; track f) {
                    <th>
                      <div>{{ fieldLabel(f) }}</div>
                      <small class="mono muted">{{ f }}</small>
                    </th>
                  }
                  @if (auth.isAdmin()) {
                    <th>จัดการ</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of filteredRows(); track rowKey(row)) {
                  <tr>
                    @for (f of currentSchema().fields; track f) {
                      <td>
                        @if (f === 'role') {
                          <span class="badge" [class.success]="row[f] === 'Leader'" [class.neutral]="row[f] !== 'Leader'">
                            {{ row[f] }}
                          </span>
                        } @else if (isKeyField(f)) {
                          <span class="mono">{{ row[f] }}</span>
                        } @else {
                          {{ row[f] }}
                        }
                      </td>
                    }
                    @if (auth.isAdmin()) {
                      <td>
                        <div class="row">
                          <button type="button" class="btn ghost sm icon" (click)="openEdit(row)" title="แก้ไข">
                            <app-icon name="pencil" [size]="15" />
                          </button>
                          <button type="button" class="btn ghost sm icon" (click)="deleteRow(row)" title="ลบ">
                            <app-icon name="trash" [size]="15" />
                          </button>
                        </div>
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    </div>

    @if (editingRow(); as ed) {
      <div class="scrim" (click)="editingRow.set(null)">
        <div class="dialog" (click)="$event.stopPropagation()">
          <div class="dialog-head">
            <h3>{{ ed.isNew ? 'เพิ่มข้อมูล' : 'แก้ไขข้อมูล' }} · {{ currentTabLabel() }}</h3>
            <button type="button" class="btn ghost sm icon" (click)="editingRow.set(null)">
              <app-icon name="x" [size]="16" />
            </button>
          </div>
          <div class="dialog-body">
            @for (f of currentSchema().fields; track f) {
              <div class="field">
                <label>{{ fieldLabel(f) }} <span class="mono small muted">({{ f }})</span></label>
                @if (f === 'role') {
                  <select class="input" [(ngModel)]="ed.form[f]">
                    <option value="Leader">Leader (หัวหน้าแผนกวิชา)</option>
                    <option value="Teacher">Teacher (ครูผู้สอน)</option>
                  </select>
                } @else if (f === 'day') {
                  <select class="input" [(ngModel)]="ed.form[f]">
                    @for (day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; track day) {
                      <option [value]="day">{{ day }}</option>
                    }
                  </select>
                } @else if (f === 'teacher_id' && activeTab() !== 'teacher') {
                  <select class="input" [(ngModel)]="ed.form[f]">
                    @for (t of state.data()?.data?.['teacher'] || []; track t['teacher_id']) {
                      <option [value]="t['teacher_id']">{{ t['teacher_id'] }} {{ t['teacher_name'] }}</option>
                    }
                  </select>
                } @else if (f === 'subject_id' && activeTab() !== 'subject') {
                  <select class="input" [(ngModel)]="ed.form[f]">
                    @for (s of state.data()?.data?.['subject'] || []; track s['subject_id']) {
                      <option [value]="s['subject_id']">{{ s['subject_id'] }} {{ s['subject_name'] }}</option>
                    }
                  </select>
                } @else if (f === 'group_id' && activeTab() !== 'student_group') {
                  <select class="input" [(ngModel)]="ed.form[f]">
                    @for (g of state.data()?.data?.['student_group'] || []; track g['group_id']) {
                      <option [value]="g['group_id']">{{ g['group_id'] }} {{ g['group_name'] }}</option>
                    }
                  </select>
                } @else if (f === 'room_type') {
                  <input class="input" [(ngModel)]="ed.form[f]" list="room-types" />
                  <datalist id="room-types">
                    <option value="ห้องเรียน/ปฏิบัติการ"></option>
                    <option value="Theory"></option>
                    <option value="Computer Lab"></option>
                  </datalist>
                } @else if (isIntField(f)) {
                  <input class="input" type="number" [(ngModel)]="ed.form[f]" />
                } @else {
                  <input class="input" [(ngModel)]="ed.form[f]" />
                }
              </div>
            }
          </div>
          <div class="dialog-foot">
            <button type="button" class="btn" (click)="editingRow.set(null)">ยกเลิก</button>
            <button type="button" class="btn primary" (click)="saveDialog()" [disabled]="busy()">บันทึก</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .dropzone {
      border: 2px dashed var(--border-strong);
      border-radius: var(--radius-lg);
      background: var(--surface);
      padding: 26px 20px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      color: var(--maroon-700);
      transition: background 0.15s var(--ease), border-color 0.15s var(--ease);
    }
    .dropzone.over,
    .dropzone:hover {
      background: var(--maroon-50);
      border-color: var(--maroon-700);
    }
    .tabs-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
      background: var(--bg);
    }
    .tab-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 12px;
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      background: transparent;
      font: inherit;
      font-weight: 500;
      cursor: pointer;
    }
    .tab-btn.active {
      background: var(--surface);
      border-color: var(--border-strong);
      color: var(--maroon-700);
      font-weight: 600;
    }
    .search-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 260px;
    }
    .max-t {
      max-height: 540px;
      overflow: auto;
    }
  `,
})
export class DataPage {
  readonly state = inject(AppState);
  readonly auth = inject(AuthService);
  private readonly api = inject(Api);
  private readonly toasts = inject(Toasts);
  private readonly confirm = inject(Confirm);

  readonly tabs = TABS;
  readonly activeTab = signal('teacher');
  readonly search = signal('');
  readonly dragOver = signal(false);
  readonly busy = signal(false);
  readonly editingRow = signal<{ isNew: boolean; key: string; form: Record<string, string | number> } | null>(null);

  readonly currentSchema = computed(() => {
    const sc = this.state.data()?.schema?.[this.activeTab()];
    return sc || { file: '', aliases: [], fields: [], key: [], int: [] };
  });

  readonly currentTabLabel = computed(() => TABS.find((t) => t.key === this.activeTab())?.label || '');

  readonly totalRows = computed(() => this.state.data()?.data?.[this.activeTab()] || []);

  readonly filteredRows = computed(() => {
    const q = this.search().trim().toLowerCase();
    const rows = this.totalRows();
    if (!q) return rows;
    return rows.filter((r) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q)));
  });

  selectTab(key: string) {
    this.activeTab.set(key);
    this.search.set('');
  }

  fieldLabel(f: string) {
    return FIELD_LABELS[f] || f;
  }

  isKeyField(f: string) {
    return this.currentSchema().key.includes(f);
  }

  isIntField(f: string) {
    return this.currentSchema().int.includes(f);
  }

  rowKey(row: Record<string, string | number>) {
    return this.currentSchema()
      .key.map((k) => String(row[k] ?? ''))
      .join('|');
  }

  onDragOver(e: DragEvent) {
    e.preventDefault();
    this.dragOver.set(true);
  }

  async onDrop(e: DragEvent) {
    e.preventDefault();
    this.dragOver.set(false);
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) await this.uploadFiles(files);
  }

  async onFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = [...(input.files || [])];
    input.value = '';
    if (files.length) await this.uploadFiles(files);
  }

  async uploadFiles(files: File[]) {
    this.busy.set(true);
    try {
      const res = await this.api.importFiles(files);
      await this.state.refresh();
      const summary = res.imported.map((x) => `${x.entity} (${x.rows})`).join(', ');
      this.toasts.success(summary ? `นำเข้าสำเร็จ: ${summary}` : 'ไม่พบตารางที่ตรงกับไฟล์ที่นำเข้า');
    } catch (err) {
      this.toasts.error(this.api.errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  async resetData() {
    const ok = await this.confirm.ask({
      title: 'คืนค่าข้อมูลต้นฉบับ',
      message: 'ข้อมูลทั้ง 7 ตารางจะถูกเขียนทับด้วยข้อมูลตั้งต้น ต้องการดำเนินการต่อหรือไม่?',
      confirmLabel: 'คืนค่า',
      danger: true,
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      await this.api.resetData();
      await this.state.refresh();
      this.toasts.success('คืนค่าข้อมูลต้นฉบับเรียบร้อย');
    } catch (err) {
      this.toasts.error(this.api.errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  openAdd() {
    const form: Record<string, string | number> = {};
    for (const f of this.currentSchema().fields) {
      form[f] = this.isIntField(f) ? 0 : f === 'role' ? 'Teacher' : f === 'day' ? 'Mon' : '';
    }
    this.editingRow.set({ isNew: true, key: '', form });
  }

  openEdit(row: Record<string, string | number>) {
    this.editingRow.set({ isNew: false, key: this.rowKey(row), form: { ...row } });
  }

  async saveDialog() {
    const ed = this.editingRow();
    if (!ed) return;
    this.busy.set(true);
    try {
      if (ed.isNew) await this.api.addRow(this.activeTab(), ed.form);
      else await this.api.updateRow(this.activeTab(), ed.key, ed.form);
      this.editingRow.set(null);
      await this.state.refresh();
      this.toasts.success('บันทึกข้อมูลเรียบร้อย');
    } catch (err) {
      this.toasts.error(this.api.errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  async deleteRow(row: Record<string, string | number>) {
    const key = this.rowKey(row);
    const ok = await this.confirm.ask({
      title: 'ลบข้อมูล',
      message: `ต้องการลบรายการรหัส "${key}" ใช่หรือไม่?`,
      confirmLabel: 'ลบ',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.deleteRow(this.activeTab(), key);
      await this.state.refresh();
      this.toasts.success('ลบข้อมูลเรียบร้อย');
    } catch (err) {
      this.toasts.error(this.api.errorMessage(err));
    }
  }
}
