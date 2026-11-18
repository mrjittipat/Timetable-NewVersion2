import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService, ROLE_TH } from '../core/auth';
import { AppState } from '../core/state';
import { Toasts } from '../core/toast';
import { Api } from '../core/api';
import { Avatar } from '../shared/avatar';
import { ChatWidget } from '../shared/chat-widget';
import { Icon } from '../shared/icon';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, Avatar, ChatWidget],
  template: `
    <a class="skip-link" href="#main">ข้ามไปยังเนื้อหา</a>

    <div class="layout" [class.menu-open]="menuOpen()">
      <aside class="sidebar">
        <div class="brand">
          <span class="brand-tile">
            <img src="logo.png" alt="" width="28" height="28" />
          </span>
          <div>
            <strong>วิทยาลัยเทคนิคพังงา</strong>
            <span>ระบบจัดตารางเรียนอัตโนมัติ</span>
          </div>
        </div>

        <nav class="nav" aria-label="เมนูหลัก">
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" (click)="menuOpen.set(false)">
            <app-icon name="dashboard" [size]="18" /> ภาพรวม
          </a>
          <a routerLink="/data" routerLinkActive="active" (click)="menuOpen.set(false)">
            <app-icon name="database" [size]="18" /> จัดการข้อมูล
          </a>
          <a routerLink="/solve" routerLinkActive="active" (click)="menuOpen.set(false)">
            <app-icon name="sparkles" [size]="18" /> จัดตารางอัตโนมัติ
          </a>
          <a routerLink="/timetable" routerLinkActive="active" (click)="menuOpen.set(false)">
            <app-icon name="calendar" [size]="18" /> ตารางเรียน
          </a>
          <a routerLink="/teacher-summary" routerLinkActive="active" (click)="menuOpen.set(false)">
            <app-icon name="users" [size]="18" /> สรุปภาระสอนครู
          </a>
          <a routerLink="/report" routerLinkActive="active" (click)="menuOpen.set(false)">
            <app-icon name="shield" [size]="18" /> ผลตรวจเงื่อนไข
          </a>
          <a routerLink="/export" routerLinkActive="active" (click)="menuOpen.set(false)">
            <app-icon name="download" [size]="18" /> ส่งออกไฟล์
          </a>
        </nav>

        <a class="status-card" routerLink="/report" (click)="menuOpen.set(false)">
          <span class="st-label">สถานะตารางล่าสุด</span>
          @if (!state.hasTimetable()) {
            <strong>ยังไม่ได้จัดตาราง</strong>
            <span class="st-sub">กดจัดตารางอัตโนมัติเพื่อเริ่ม</span>
          } @else if (state.validationPassed()) {
            <strong>ผ่านทุกเงื่อนไข</strong>
            <span class="st-sub">{{ state.timetable()?.rows?.length || 0 }} คาบในตาราง</span>
          } @else {
            <strong>มีเงื่อนไขไม่ผ่าน</strong>
            <span class="st-sub">ดูรายละเอียดที่ผลตรวจเงื่อนไข</span>
          }
        </a>
      </aside>

      @if (menuOpen()) {
        <div class="backdrop" (click)="menuOpen.set(false)"></div>
      }

      <div class="main-col">
        <header class="topbar">
          <button type="button" class="btn ghost icon menu-btn" (click)="menuOpen.set(!menuOpen())" aria-label="เมนู">
            <app-icon name="menu" />
          </button>
          <span class="top-title">ระบบจัดตารางเรียนด้วยอัลกอริทึมปัญญาประดิษฐ์</span>
          <span class="spacer"></span>
          <button type="button" class="btn sm" (click)="reload()" [disabled]="state.loading()">
            <app-icon name="refresh" [size]="16" /> โหลดข้อมูลใหม่
          </button>

          <div class="profile-wrap">
            <button type="button" class="profile-btn" (click)="profileOpen.set(!profileOpen())">
              <app-avatar [src]="auth.user()?.avatar || ''" [name]="auth.user()?.name || 'U'" [size]="32" />
              <span class="p-text">
                <strong>{{ auth.user()?.name }}</strong>
                <small>{{ roleLabel() }}</small>
              </span>
              <app-icon name="chevron" [size]="16" />
            </button>

            @if (profileOpen()) {
              <div class="profile-menu" (click)="$event.stopPropagation()">
                <div class="pm-head">
                  <app-avatar [src]="auth.user()?.avatar || ''" [name]="auth.user()?.name || 'U'" [size]="40" />
                  <div>
                    <strong>{{ auth.user()?.name }}</strong>
                    <div class="small muted">{{ auth.user()?.username }} · {{ roleLabel() }}</div>
                  </div>
                </div>
                <a class="pm-item" routerLink="/settings" (click)="profileOpen.set(false)">
                  <app-icon name="user" [size]="16" /> ตั้งค่า
                </a>
                <button type="button" class="pm-item danger" (click)="doLogout()">
                  <app-icon name="x" [size]="16" /> ออกจากระบบ
                </button>
              </div>
            }
          </div>
        </header>

        <div class="banners">
          @if (auth.user()?.mustChangePassword) {
            <div class="alert warning">
              <app-icon name="alert" [size]="18" />
              <span>บัญชีนี้ยังใช้รหัสผ่านเริ่มต้นหรือรหัสที่ผู้ดูแลตั้งให้ กรุณาเปลี่ยนรหัสผ่านเพื่อความปลอดภัย</span>
              <span class="spacer"></span>
              <a class="btn sm" routerLink="/settings">เปลี่ยนรหัสผ่าน</a>
            </div>
          }
          @if (auth.user() && !auth.isAdmin()) {
            <div class="alert info">
              <app-icon name="info" [size]="18" />
              <span>บัญชี{{ roleLabel() }} ดูข้อมูลได้อย่างเดียว การแก้ไขทำได้เฉพาะผู้ดูแลระบบ</span>
            </div>
          }
        </div>

        <main id="main" class="content">
          <router-outlet />
        </main>
      </div>
    </div>

    <app-chat-widget />
  `,
  styles: `
    .layout {
      min-height: 100vh;
      display: flex;
    }
    .sidebar {
      position: fixed;
      inset: 0 auto 0 0;
      width: var(--sidebar-w);
      background: linear-gradient(180deg, var(--maroon-800) 0%, var(--maroon-950) 100%);
      color: #fff;
      display: flex;
      flex-direction: column;
      padding: 18px 14px;
      gap: 18px;
      z-index: 900;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 4px 6px;
    }
    .brand-tile {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: #fff;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .brand strong {
      display: block;
      font-size: 14.5px;
      line-height: 1.2;
    }
    .brand span {
      display: block;
      font-size: 11.5px;
      opacity: 0.82;
    }
    .nav {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1 1 auto;
    }
    .nav a {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: var(--radius);
      color: rgba(255, 255, 255, 0.88);
      font-weight: 500;
      transition: background 0.15s var(--ease), color 0.15s var(--ease);
    }
    .nav a:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
    }
    .nav a.active {
      background: #fff;
      color: var(--maroon-700);
      font-weight: 600;
    }
    .status-card {
      padding: 12px 14px;
      border-radius: var(--radius);
      background: rgba(255, 255, 255, 0.11);
      border: 1px solid rgba(255, 255, 255, 0.16);
      color: #fff;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .st-label {
      font-size: 11px;
      opacity: 0.8;
    }
    .st-sub {
      font-size: 12px;
      opacity: 0.85;
    }
    .main-col {
      margin-left: var(--sidebar-w);
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .topbar {
      height: var(--header-h);
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 0 22px;
      display: flex;
      align-items: center;
      gap: 12px;
      position: sticky;
      top: 0;
      z-index: 500;
    }
    .menu-btn {
      display: none;
    }
    .top-title {
      font-weight: 600;
      color: var(--maroon-800);
    }
    .profile-wrap {
      position: relative;
    }
    .profile-btn {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      padding: 4px 10px 4px 4px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--surface);
      cursor: pointer;
      font: inherit;
    }
    .p-text {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      line-height: 1.2;
    }
    .p-text strong {
      font-size: 13px;
    }
    .p-text small {
      font-size: 11px;
      color: var(--text-muted);
    }
    .profile-menu {
      position: absolute;
      right: 0;
      top: calc(100% + 6px);
      width: 240px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      z-index: 600;
    }
    .pm-head {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 4px;
    }
    .pm-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: var(--radius-sm);
      border: none;
      background: transparent;
      color: var(--text);
      font: inherit;
      cursor: pointer;
      text-align: left;
    }
    .pm-item:hover {
      background: var(--maroon-50);
    }
    .pm-item.danger {
      color: var(--danger);
    }
    .banners {
      padding: 12px 24px 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .banners:empty {
      display: none;
    }
    .content {
      flex: 1 1 auto;
    }
    .backdrop {
      display: none;
    }
    @media (max-width: 960px) {
      .sidebar {
        transform: translateX(-100%);
        transition: transform 0.22s var(--ease);
      }
      .layout.menu-open .sidebar {
        transform: translateX(0);
      }
      .main-col {
        margin-left: 0;
      }
      .menu-btn {
        display: inline-flex;
      }
      .backdrop {
        display: block;
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.36);
        z-index: 800;
      }
    }
  `,
})
export class Shell implements OnInit {
  readonly auth = inject(AuthService);
  readonly state = inject(AppState);
  private readonly api = inject(Api);
  private readonly toasts = inject(Toasts);
  private readonly router = inject(Router);

  readonly menuOpen = signal(false);
  readonly profileOpen = signal(false);
  readonly roleLabel = computed(() => {
    const r = this.auth.user()?.role;
    return r ? ROLE_TH[r] : '';
  });

  ngOnInit() {
    void this.reload(true);
  }

  async reload(silent = false) {
    try {
      await this.state.refresh();
      if (!silent) this.toasts.success('โหลดข้อมูลล่าสุดเรียบร้อย');
    } catch (err) {
      this.toasts.error(this.api.errorMessage(err));
    }
  }

  async doLogout() {
    this.profileOpen.set(false);
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
