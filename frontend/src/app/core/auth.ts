import { HttpClient, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, firstValueFrom, throwError } from 'rxjs';
import { Role, User } from './models';

export const ROLE_TH: Record<Role, string> = {
  admin: 'ผู้ดูแลระบบ',
  teacher: 'ครู',
  viewer: 'ผู้ชม',
};

interface MeResponse {
  user: User | null;
  defaultPassword: boolean;
  defaultAdmin: { username: string; password: string } | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private loaded = false;
  private inflight: Promise<User | null> | null = null;

  readonly user = signal<User | null>(null);
  readonly defaultAdmin = signal<{ username: string; password: string } | null>(null);
  readonly isAdmin = computed(() => this.user()?.role === 'admin');

  async me(): Promise<User | null> {
    const res = await firstValueFrom(this.http.get<MeResponse>('/api/auth/me'));
    this.user.set(res.user);
    this.defaultAdmin.set(res.defaultAdmin);
    this.loaded = true;
    return res.user;
  }

  async ensureLoaded(): Promise<User | null> {
    if (this.loaded) return this.user();
    if (!this.inflight) {
      this.inflight = this.me().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  async login(username: string, password: string): Promise<User> {
    const res = await firstValueFrom(this.http.post<{ user: User }>('/api/auth/login', { username, password }));
    this.user.set(res.user);
    this.loaded = true;
    return res.user;
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/logout', {}));
    this.user.set(null);
  }

  async updateProfile(body: { name?: string; avatar?: string }): Promise<User> {
    const res = await firstValueFrom(this.http.put<{ user: User }>('/api/auth/profile', body));
    this.user.set(res.user);
    return res.user;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<User> {
    const res = await firstValueFrom(this.http.post<{ user: User }>('/api/auth/password', { currentPassword, newPassword }));
    this.user.set(res.user);
    this.defaultAdmin.set(null);
    return res.user;
  }

  clearLocal() {
    this.user.set(null);
  }
}

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const u = await auth.ensureLoaded();
  if (u) return true;
  return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
};

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const u = await auth.ensureLoaded();
  if (u?.role === 'admin') return true;
  return router.createUrlTree(['/']);
};

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return next(req).pipe(
    catchError((err) => {
      if (err?.status === 401 && !req.url.includes('/api/auth/') && !req.url.includes('/api/public/')) {
        auth.clearLocal();
        void router.navigate(['/login'], { queryParams: { next: router.url } });
      }
      return throwError(() => err);
    })
  );
};
