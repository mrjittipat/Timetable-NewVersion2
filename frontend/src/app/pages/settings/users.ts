import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../core/api';
import { ROLE_TH } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { Role, User } from '../../core/models';
import { AppState } from '../../core/state';
import { Toasts } from '../../core/toast';
import { Avatar } from '../../shared/avatar';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [FormsModule, Avatar, Icon],
  template: `
    <section class="card">
      <div class="card-head">
        <h3>จัดการผู้ใช้งาน ({{ users().length }})</h3>
        <div class="row">
          @if (missingTeachers().length > 0) {
            <button type="button" class="btn sm" (click)="createMissingTeacherAccounts()" [disabled]="busy()">
              <app-icon name="users" [size]="15" /> สร้างบัญชีครูที่ยังไม่มี ({{ missingTeachers().length }})
            </button>
          }
          <button type="button" class="btn primary sm" (click)="openAdd()">
            <app-icon name="plus" [size]="15" /> เพิ่มผู้ใช้
          </button>
        </div>
      </div>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>ผู้ใช้</th>
              <th>ชื่อผู้ใช้</th>
              <th>สิทธิ์</th>
              <th>เชื่อมโยงครู</th>
              <th>สถานะ</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            @for (u of users(); track u.username) {
              <tr>
                <td>
                  <div class="row">
                    <app-avatar [src]="u.avatar" [name]="u.name" [size]="30" />
                    <strong>{{ u.name }}</strong>
                  </div>
                </td>
                <td class="mono">{{ u.username }}</td>
                <td><span class="badge neutral">{{ roleLabel(u.role) }}</span></td>
                <td class="mono">{{ u.teacher_id || '-' }}</td>
                <td>
                  @if (u.mustChangePassword) {
                    <span class="badge warning">ต้องเปลี่ยนรหัส</span>
                  } @else {
                    <span class="badge success">ปกติ</span>
                  }
                </td>
                <td>
                  <div class="row">
                    <button type="button" class="btn ghost sm icon" (click)="openEdit(u)" title="แก้ไข">
                      <app-icon name="pencil" [size]="15" />
                    </button>
                    <button type="button" class="btn ghost sm icon" (click)="deleteUser(u)" title="ลบ">
                      <app-icon name="trash" [size]="15" />
                    </button>
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>

    @if (dialog(); as d) {
      <div class="scrim" (click)="dialog.set(null)">
        <div class="dialog" (click)="$event.stopPropagation()">
          <div class="dialog-head">
            <h3>{{ d.isNew ? 'เพิ่มผู้ใช้งาน' : 'แก้ไขผู้ใช้งาน' }}</h3>
            <button type="button" class="btn ghost sm icon" (click)="dialog.set(null)"><app-icon name="x" [size]="16" /></button>
          </div>
          <div class="dialog-body">
            <div class="field">
              <label>ชื่อผู้ใช้</label>
              <input class="input" [(ngModel)]="d.username" [disabled]="!d.isNew" />
            </div>
            <div class="field">
              <label>ชื่อที่แสดง</label>
              <input class="input" [(ngModel)]="d.name" />
            </div>
            <div class="field">
              <label>สิทธิ์</label>
              <select class="input" [(ngModel)]="d.role">
                <option value="admin">ผู้ดูแลระบบ (admin)</option>
                <option value="teacher">ครู (teacher)</option>
                <option value="viewer">ผู้ชม (viewer)</option>
              </select>
            </div>
            <div class="field">
              <label>เชื่อมโยงครูผู้สอน (ถ้าเป็นครู)</label>
              <select class="input" [(ngModel)]="d.teacher_id">
                <option value="">— ไม่ระบุ —</option>
                @for (t of state.data()?.data?.['teacher'] || []; track t['teacher_id']) {
                  <option [value]="t['teacher_id']">{{ t['teacher_id'] }} {{ t['teacher_name'] }}</option>
                }
              </select>
            </div>
            <div class="field">
              <label>{{ d.isNew ? 'รหัสผ่าน (อย่างน้อย 6 ตัว)' : 'ตั้งรหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)' }}</label>
              <input class="input" type="password" [(ngModel)]="d.password" />
            </div>
          </div>
          <div class="dialog-foot">
            <button type="button" class="btn" (click)="dialog.set(null)">ยกเลิก</button>
            <button type="button" class="btn primary" (click)="saveDialog()" [disabled]="busy()">บันทึก</button>
          </div>
        </div>
      </div>
    }

    @if (bulkCreated().length > 0) {
      <div class="scrim" (click)="bulkCreated.set([])">
        <div class="dialog" (click)="$event.stopPropagation()">
          <div class="dialog-head">
            <h3>รหัสผ่านชั่วคราวที่สร้างใหม่</h3>
            <button type="button" class="btn ghost sm icon" (click)="bulkCreated.set([])"><app-icon name="x" [size]="16" /></button>
          </div>
          <div class="dialog-body">
            <p class="small muted">กรุณาบันทึกรหัสผ่านชั่วคราวเหล่านี้ไว้ (แสดงเพียงครั้งเดียว)</p>
            <div class="table-wrap">
              <table class="table">
                <thead><tr><th>ชื่อผู้ใช้</th><th>ชื่อ</th><th>รหัสผ่านชั่วคราว</th></tr></thead>
                <tbody>
                  @for (c of bulkCreated(); track c.username) {
                    <tr><td class="mono">{{ c.username }}</td><td>{{ c.name }}</td><td class="mono">{{ c.password }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
          <div class="dialog-foot">
            <button type="button" class="btn" (click)="copyBulk()">คัดลอกทั้งหมด</button>
            <button type="button" class="btn primary" (click)="bulkCreated.set([])">ปิด</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class UsersPanel implements OnInit {
  readonly state = inject(AppState);
  private readonly api = inject(Api);
  private readonly toasts = inject(Toasts);
  private readonly confirm = inject(Confirm);

  readonly users = signal<User[]>([]);
  readonly busy = signal(false);
  readonly dialog = signal<{ isNew: boolean; username: string; name: string; role: Role; teacher_id: string; password: string } | null>(null);
  readonly bulkCreated = signal<{ username: string; name: string; password: string }[]>([]);

  readonly missingTeachers = computed(() => {
    const teachers = this.state.data()?.data?.['teacher'] || [];
    const linked = new Set(this.users().map((u) => u.teacher_id).filter(Boolean));
    return teachers.filter((t) => !linked.has(String(t['teacher_id'])));
  });

  async ngOnInit() {
    await this.load();
  }

  async load() {
    try {
      this.users.set((await this.api.getUsers()).users);
    } catch (err) {
      this.toasts.error(this.api.errorMessage(err));
    }
  }

  roleLabel(r: Role) {
    return ROLE_TH[r] || r;
  }

  openAdd() {
    this.dialog.set({ isNew: true, username: '', name: '', role: 'viewer', teacher_id: '', password: '' });
  }

  openEdit(u: User) {
    this.dialog.set({ isNew: false, username: u.username, name: u.name, role: u.role, teacher_id: u.teacher_id || '', password: '' });
  }

  async saveDialog() {
    const d = this.dialog();
    if (!d) return;
    this.busy.set(true);
    try {
      if (d.isNew) {
        await this.api.createUser({ username: d.username, name: d.name, role: d.role, teacher_id: d.teacher_id, password: d.password });
      } else {
        await this.api.updateUser(d.username, {
          name: d.name,
          role: d.role,
          teacher_id: d.teacher_id,
          ...(d.password ? { password: d.password } : {}),
        });
      }
      this.dialog.set(null);
      await this.load();
      this.toasts.success('บันทึกข้อมูลผู้ใช้เรียบร้อย');
    } catch (err) {
      this.toasts.error(this.api.errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  async deleteUser(u: User) {
    const ok = await this.confirm.ask({
      title: 'ลบผู้ใช้งาน',
      message: `ต้องการลบบัญชี "${u.username}" (${u.name}) ใช่หรือไม่?`,
      confirmLabel: 'ลบ',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.deleteUser(u.username);
      await this.load();
      this.toasts.success('ลบผู้ใช้งานแล้ว');
    } catch (err) {
      this.toasts.error(this.api.errorMessage(err));
    }
  }

  async createMissingTeacherAccounts() {
    const missing = this.missingTeachers();
    if (!missing.length) return;
    this.busy.set(true);
    const created: { username: string; name: string; password: string }[] = [];
    try {
      for (const t of missing) {
        const tid = String(t['teacher_id']);
        const uname = tid.toLowerCase();
        const pw = Math.random().toString(36).slice(2, 10);
        await this.api.createUser({ username: uname, name: String(t['teacher_name']), role: 'teacher', teacher_id: tid, password: pw });
        created.push({ username: uname, name: String(t['teacher_name']), password: pw });
      }
      await this.load();
      this.bulkCreated.set(created);
      this.toasts.success(`สร้างบัญชีครู ${created.length} บัญชีเรียบร้อย`);
    } catch (err) {
      this.toasts.error(this.api.errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  async copyBulk() {
    const txt = this.bulkCreated().map((c) => `${c.username}\t${c.password}\t${c.name}`).join('\n');
    await navigator.clipboard.writeText(txt);
    this.toasts.success('คัดลอกทั้งหมดแล้ว');
  }
}
