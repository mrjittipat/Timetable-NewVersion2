import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { AuthService } from '../../core/auth';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, Icon],
  template: `
    <div class="login-wrap">
      <section class="hero-col">
        <div class="hero-top">
          <span class="logo-tile">
            <img src="logo.png" alt="วิทยาลัยเทคนิคพังงา" width="32" height="32" />
          </span>
          <div>
            <strong>วิทยาลัยเทคนิคพังงา</strong>
            <span>สำนักงานคณะกรรมการการอาชีวศึกษา</span>
          </div>
        </div>

        <div class="hero-mid">
          <span class="pill">SMART TIMETABLE</span>
          <h1>ระบบจัดตารางเรียน<br />อัตโนมัติ</h1>
          <p>จัดตารางเรียนด้วยอัลกอริทึมปัญญาประดิษฐ์ ตรวจครบทุกเงื่อนไข พร้อมใช้งานทั้งวิทยาลัย</p>
          <div class="chips">
            <span class="chip">จัดตารางครบทุกเงื่อนไขในไม่ถึง 1 วินาที</span>
            <span class="chip">ตรวจผลด้วย validator อิสระ</span>
            <span class="chip">ผู้ช่วยจัดตารางแบบออฟไลน์</span>
          </div>
        </div>

        <div class="hero-foot">ระบบจัดตารางเรียนและตารางสอนวิทยาลัยเทคนิคพังงา</div>
      </section>

      <section class="form-col">
        <div class="login-card">
          <div class="card-top-bar"></div>
          <div class="card-inner">
            <div class="icon-tile">
              <app-icon name="calendar" [size]="24" />
            </div>
            <h2>เข้าสู่ระบบ</h2>
            <p class="muted">ใช้บัญชีที่ผู้ดูแลระบบสร้างให้</p>

            <form [formGroup]="form" (ngSubmit)="submit()" class="login-form">
              <div class="field">
                <label for="uname">ชื่อผู้ใช้</label>
                <input id="uname" class="input" formControlName="username" autocomplete="username" />
              </div>

              <div class="field">
                <label for="upass">รหัสผ่าน</label>
                <div class="pw-row">
                  <input
                    id="upass"
                    class="input"
                    [type]="showPw() ? 'text' : 'password'"
                    formControlName="password"
                    autocomplete="current-password"
                  />
                  <button type="button" class="btn sm" (click)="showPw.set(!showPw())">
                    {{ showPw() ? 'ซ่อน' : 'แสดง' }}
                  </button>
                </div>
              </div>

              @if (errorMsg()) {
                <div class="alert danger">
                  <app-icon name="alert" [size]="17" />
                  <span>{{ errorMsg() }}</span>
                </div>
              }

              <button type="submit" class="btn primary lg submit-btn" [disabled]="busy()">
                @if (busy()) {
                  <span class="spinner"></span>
                }
                เข้าสู่ระบบ
              </button>
            </form>

            @if (auth.defaultAdmin(); as def) {
              <div class="alert info">
                <app-icon name="info" [size]="17" />
                <div>
                  บัญชีเริ่มต้น: <span class="mono">{{ def.username }}</span> / <span class="mono">{{ def.password }}</span>
                </div>
              </div>
            }

            <div class="divider"><span>หรือ</span></div>

            <a class="btn public-link" routerLink="/p">
              <app-icon name="external" [size]="16" /> ดูตารางเรียนแบบไม่ต้องเข้าสู่ระบบ
            </a>

            <footer class="login-foot">© วิทยาลัยเทคนิคพังงา · ระบบจัดตารางเรียนอัตโนมัติ</footer>
          </div>
        </div>
      </section>
    </div>
  `,
  styles: `
    .login-wrap {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 1.15fr 1fr;
    }
    .hero-col {
      background:
        radial-gradient(circle at 18% 20%, rgba(255, 255, 255, 0.14), transparent 44%),
        radial-gradient(circle at 85% 80%, rgba(155, 27, 48, 0.38), transparent 48%),
        repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.04) 0 1px, transparent 1px 42px),
        repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.04) 0 1px, transparent 1px 42px),
        linear-gradient(160deg, var(--maroon-700) 0%, var(--maroon-950) 100%);
      color: #fff;
      padding: 40px 48px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 32px;
    }
    .hero-top {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .logo-tile {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: #fff;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .hero-top strong {
      display: block;
      font-size: 16px;
    }
    .hero-top span {
      display: block;
      font-size: 12.5px;
      opacity: 0.85;
    }
    .pill {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      background: rgba(255, 255, 255, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.26);
      margin-bottom: 14px;
    }
    .hero-mid h1 {
      font-size: clamp(28px, 3.6vw, 42px);
      line-height: 1.2;
      margin-bottom: 14px;
    }
    .hero-mid p {
      max-width: 480px;
      font-size: 15px;
      opacity: 0.9;
      margin-bottom: 20px;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .chip {
      padding: 7px 13px;
      border-radius: 999px;
      font-size: 12.5px;
      background: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.22);
      backdrop-filter: blur(6px);
    }
    .hero-foot {
      font-size: 12.5px;
      opacity: 0.72;
    }
    .form-col {
      background: radial-gradient(circle, var(--border) 1px, transparent 1px) 0 0 / 20px 20px, var(--bg);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px 24px;
    }
    .login-card {
      width: 100%;
      max-width: 420px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      overflow: hidden;
    }
    .card-top-bar {
      height: 4px;
      background: var(--maroon-700);
    }
    .card-inner {
      padding: 28px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .icon-tile {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: var(--maroon-100);
      color: var(--maroon-700);
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .login-form {
      display: flex;
      flex-direction: column;
      gap: 14px;
      margin-top: 4px;
    }
    .pw-row {
      display: flex;
      gap: 8px;
    }
    .submit-btn {
      width: 100%;
    }
    .divider {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--text-muted);
      font-size: 12.5px;
    }
    .divider::before,
    .divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--border);
    }
    .public-link {
      width: 100%;
    }
    .login-foot {
      text-align: center;
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 4px;
    }
    @media (max-width: 860px) {
      .login-wrap {
        grid-template-columns: 1fr;
      }
      .hero-col {
        padding: 28px 24px;
      }
    }
  `,
})
export class LoginPage implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly showPw = signal(false);
  readonly busy = signal(false);
  readonly errorMsg = signal('');

  readonly form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });

  ngOnInit() {
    void this.auth.ensureLoaded();
  }

  async submit() {
    if (this.form.invalid || this.busy()) return;
    this.errorMsg.set('');
    this.busy.set(true);
    try {
      const { username, password } = this.form.getRawValue();
      const user = await this.auth.login(username, password);
      const next = this.route.snapshot.queryParamMap.get('next');
      if (next) {
        await this.router.navigateByUrl(next);
      } else if (user.role === 'teacher' && user.teacher_id) {
        await this.router.navigate(['/timetable'], { queryParams: { view: 'teacher', id: user.teacher_id } });
      } else {
        await this.router.navigate(['/']);
      }
    } catch (err) {
      this.errorMsg.set(this.api.errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
