import { Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Api } from '../../core/api';
import { AuthService, ROLE_TH } from '../../core/auth';
import { Toasts } from '../../core/toast';
import { Avatar } from '../../shared/avatar';
import { Icon } from '../../shared/icon';
import { UsersPanel } from './users';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [FormsModule, Avatar, Icon, UsersPanel],
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <div class="eyebrow">บัญชีของฉัน</div>
          <h1>ตั้งค่า</h1>
        </div>
        @if (auth.isAdmin()) {
          <div class="segmented">
            <button type="button" [class.active]="tab() === 'profile'" (click)="switchTab('profile')">โปรไฟล์</button>
            <button type="button" [class.active]="tab() === 'users'" (click)="switchTab('users')">ผู้ใช้งาน</button>
          </div>
        }
      </header>

      @if (tab() === 'users' && auth.isAdmin()) {
        <app-users />
      } @else if (auth.user(); as u) {
        <div class="grid-2">
          <section class="card">
            <div class="card-head"><h3>โปรไฟล์</h3></div>
            <div class="card-body col-gap">
              <div class="row">
                <app-avatar [src]="avatarDraft()" [name]="nameDraft() || u.name" [size]="112" />
                <div class="col-gap">
                  <div class="row">
                    <button type="button" class="btn sm" (click)="avatarInput.click()">
                      <app-icon name="upload" [size]="15" /> เปลี่ยนรูป
                    </button>
                    @if (avatarDraft()) {
                      <button type="button" class="btn sm danger" (click)="avatarDraft.set('')">ลบรูป</button>
                    }
                    <input #avatarInput type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" (change)="onAvatarPick($event)" />
                  </div>
                  <span class="small muted">PNG, JPEG, WebP (ปรับเป็น 256×256 อัตโนมัติ)</span>
                </div>
              </div>

              <div class="field">
                <label>ชื่อที่แสดง</label>
                <input class="input" [(ngModel)]="nameDraft" maxlength="80" />
              </div>

              <div class="facts-box">
                <div><span class="muted">ชื่อผู้ใช้:</span> <span class="mono">{{ u.username }}</span></div>
                <div><span class="muted">สิทธิ์:</span> <span class="badge neutral">{{ roleLabel(u.role) }}</span></div>
                <div><span class="muted">ครูที่เชื่อมโยง:</span> <span class="mono">{{ u.teacher_id || '-' }}</span></div>
              </div>

              <div>
                <button type="button" class="btn primary" (click)="saveProfile()" [disabled]="savingProfile()">บันทึกโปรไฟล์</button>
              </div>
            </div>
          </section>

          <section class="card">
            <div class="card-head"><h3>เปลี่ยนรหัสผ่าน</h3></div>
            <div class="card-body col-gap">
              <div class="field">
                <label>รหัสผ่านปัจจุบัน</label>
                <input class="input" [type]="showPw() ? 'text' : 'password'" [(ngModel)]="curPw" />
              </div>
              <div class="field">
                <label>รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)</label>
                <input class="input" [type]="showPw() ? 'text' : 'password'" [(ngModel)]="newPw" />
              </div>
              <div class="field">
                <label>ยืนยันรหัสผ่านใหม่</label>
                <input class="input" [type]="showPw() ? 'text' : 'password'" [(ngModel)]="confirmPw" />
                @if (pwError()) {
                  <span class="error">{{ pwError() }}</span>
                }
              </div>
              <label class="row small">
                <input type="checkbox" [(ngModel)]="showPw" /> แสดงรหัสผ่าน
              </label>
              <div>
                <button type="button" class="btn primary" (click)="changePassword()" [disabled]="savingPw()">เปลี่ยนรหัสผ่าน</button>
              </div>
            </div>
          </section>
        </div>
      }
    </div>
  `,
  styles: `
    .col-gap {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .facts-box {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 10px 12px;
      border-radius: var(--radius);
      background: var(--bg);
      font-size: 13.5px;
    }
  `,
})
export class SettingsPage {
  readonly auth = inject(AuthService);
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);

  readonly tabInput = input<string>('', { alias: 'tab' });
  readonly tab = signal<'profile' | 'users'>('profile');

  readonly nameDraft = signal('');
  readonly avatarDraft = signal('');
  readonly savingProfile = signal(false);

  curPw = '';
  newPw = '';
  confirmPw = '';
  readonly showPw = signal(false);
  readonly pwError = signal('');
  readonly savingPw = signal(false);

  constructor() {
    effect(() => {
      const t = this.tabInput();
      this.tab.set(t === 'users' && this.auth.isAdmin() ? 'users' : 'profile');
    });
    effect(() => {
      const u = this.auth.user();
      if (u) {
        this.nameDraft.set(u.name);
        this.avatarDraft.set(u.avatar || '');
      }
    });
  }

  switchTab(t: 'profile' | 'users') {
    this.tab.set(t);
    void this.router.navigate([], { queryParams: { tab: t === 'users' ? 'users' : null }, replaceUrl: true });
  }

  roleLabel(r: keyof typeof ROLE_TH) {
    return ROLE_TH[r] || r;
  }

  async onAvatarPick(e: Event) {
    const inputEl = e.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      this.toasts.error('ไฟล์รูปต้องมีขนาดไม่เกิน 10 MB');
      return;
    }
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = URL.createObjectURL(file);
      });
      const size = Math.min(img.width, img.height);
      const sx = (img.width - size) / 2;
      const sy = (img.height - size) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 256, 256);
      ctx.drawImage(img, sx, sy, size, size, 0, 0, 256, 256);
      URL.revokeObjectURL(img.src);
      this.avatarDraft.set(canvas.toDataURL('image/jpeg', 0.85));
    } catch {
      this.toasts.error('ไม่สามารถอ่านไฟล์รูปได้');
    }
  }

  async saveProfile() {
    this.savingProfile.set(true);
    try {
      await this.auth.updateProfile({ name: this.nameDraft(), avatar: this.avatarDraft() });
      this.toasts.success('บันทึกโปรไฟล์เรียบร้อย');
    } catch (err) {
      this.toasts.error(this.api.errorMessage(err));
    } finally {
      this.savingProfile.set(false);
    }
  }

  async changePassword() {
    this.pwError.set('');
    if (this.newPw.length < 6) {
      this.pwError.set('รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร');
      return;
    }
    if (this.newPw !== this.confirmPw) {
      this.pwError.set('รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }
    this.savingPw.set(true);
    try {
      await this.auth.changePassword(this.curPw, this.newPw);
      this.curPw = '';
      this.newPw = '';
      this.confirmPw = '';
      this.toasts.success('เปลี่ยนรหัสผ่านเรียบร้อย');
    } catch (err) {
      this.pwError.set(this.api.errorMessage(err));
    } finally {
      this.savingPw.set(false);
    }
  }
}
