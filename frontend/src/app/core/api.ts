import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  BestSeedResponse,
  ChatReply,
  Config,
  DataResponse,
  DiagnosisResponse,
  DocumentInfo,
  EntityRef,
  Grid,
  OutputRow,
  SavedSeed,
  SolveResponse,
  StatsResponse,
  TimetableResponse,
  User,
  Validation,
  View,
} from './models';

@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  errorMessage(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) {
        return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจว่า backend ทำงานอยู่ (พอร์ต 3000)';
      }
      const msg = (err.error as { message?: string } | null)?.message;
      if (msg) return msg;
    }
    if (err instanceof Error && err.message) return err.message;
    return 'เกิดข้อผิดพลาดในการเชื่อมต่อ';
  }

  getData() {
    return firstValueFrom(this.http.get<DataResponse>('/api/data'));
  }

  resetData() {
    return firstValueFrom(this.http.post<{ data: DataResponse['data']; warnings: DataResponse['warnings'] }>('/api/data/reset', {}));
  }

  addRow(entity: string, row: Record<string, unknown>) {
    return firstValueFrom(this.http.post<{ row: Record<string, string | number> }>(`/api/data/${encodeURIComponent(entity)}`, row));
  }

  updateRow(entity: string, key: string, row: Record<string, unknown>) {
    return firstValueFrom(
      this.http.put<{ row: Record<string, string | number> }>(`/api/data/${encodeURIComponent(entity)}/${encodeURIComponent(key)}`, row)
    );
  }

  deleteRow(entity: string, key: string) {
    return firstValueFrom(this.http.delete<{ ok: boolean }>(`/api/data/${encodeURIComponent(entity)}/${encodeURIComponent(key)}`));
  }

  importFiles(files: File[]) {
    const fd = new FormData();
    for (const f of files) fd.append('files', f, f.name);
    return firstValueFrom(
      this.http.post<{ imported: { file: string; entity: string; rows: number }[]; skipped: string[]; warnings: DataResponse['warnings'] }>(
        '/api/import',
        fd
      )
    );
  }

  getConfig() {
    return firstValueFrom(this.http.get<{ config: Config; defaults: Config }>('/api/config'));
  }

  saveConfig(cfg: Partial<Config>) {
    return firstValueFrom(this.http.put<{ config: Config }>('/api/config', cfg));
  }

  addSeed(body: Partial<SavedSeed>) {
    return firstValueFrom(this.http.post<{ savedSeeds: SavedSeed[] }>('/api/seeds', body));
  }

  deleteSeed(id: string) {
    return firstValueFrom(this.http.delete<{ savedSeeds: SavedSeed[] }>(`/api/seeds/${encodeURIComponent(id)}`));
  }

  solve(body: Record<string, unknown> = {}) {
    return firstValueFrom(this.http.post<SolveResponse>('/api/solve', body));
  }

  diagnose(body: Record<string, unknown> = {}) {
    return firstValueFrom(this.http.post<DiagnosisResponse>('/api/diagnose', body));
  }

  bestSeed(count = 20) {
    return firstValueFrom(this.http.post<BestSeedResponse>('/api/solve/best', { count }));
  }

  getStats() {
    return firstValueFrom(this.http.get<StatsResponse>('/api/stats'));
  }

  getTimetable() {
    return firstValueFrom(this.http.get<TimetableResponse>('/api/timetable'));
  }

  saveTimetable(rows: OutputRow[]) {
    return firstValueFrom(this.http.put<TimetableResponse>('/api/timetable', { rows }));
  }

  validateTimetable(rows?: OutputRow[]) {
    return firstValueFrom(this.http.post<Validation>('/api/timetable/validate', rows ? { rows } : {}));
  }

  getEntities() {
    return firstValueFrom(this.http.get<Record<View, EntityRef[]>>('/api/timetable/entities'));
  }

  getGrid(view: View, id: string) {
    return firstValueFrom(this.http.get<Grid>('/api/timetable/grid', { params: { view, id } }));
  }

  getGrids(view: View) {
    return firstValueFrom(this.http.get<{ grids: Grid[] }>('/api/timetable/grids', { params: { view } }));
  }

  moveSpan(body: { view: View; id: string; fromDay: string; fromPeriod: number; length: number; toDay: string; toPeriod: number }) {
    return firstValueFrom(this.http.post<TimetableResponse>('/api/timetable/move', body));
  }

  editSpan(body: { view: View; id: string; day: string; period: number; length: number; teacher_id?: string; room_id?: string }) {
    return firstValueFrom(this.http.post<TimetableResponse>('/api/timetable/edit', body));
  }

  getShare(view: View, id: string) {
    return firstValueFrom(this.http.get<{ url: string; base: string; enabled: boolean }>('/api/share', { params: { view, id } }));
  }

  getPublicInfo() {
    return firstValueFrom(
      this.http.get<{ enabled: boolean; college: string; semester: string; year: string; hasTimetable: boolean }>('/api/public/info')
    );
  }

  getPublicEntities() {
    return firstValueFrom(this.http.get<Record<View, EntityRef[]>>('/api/public/entities'));
  }

  getPublicGrid(view: View, id: string) {
    return firstValueFrom(this.http.get<Grid>('/api/public/grid', { params: { view, id } }));
  }

  getDocument() {
    return firstValueFrom(this.http.get<DocumentInfo>('/api/document'));
  }

  getUsers() {
    return firstValueFrom(this.http.get<{ users: User[] }>('/api/users'));
  }

  createUser(body: Record<string, unknown>) {
    return firstValueFrom(this.http.post<{ user: User }>('/api/users', body));
  }

  updateUser(username: string, body: Record<string, unknown>) {
    return firstValueFrom(this.http.put<{ user: User }>(`/api/users/${encodeURIComponent(username)}`, body));
  }

  deleteUser(username: string) {
    return firstValueFrom(this.http.delete<{ ok: boolean }>(`/api/users/${encodeURIComponent(username)}`));
  }

  chat(message: string, context: Record<string, string>) {
    return firstValueFrom(this.http.post<ChatReply>('/api/chat', { message, context }));
  }

  chatAction(kind: string, payload: unknown) {
    return firstValueFrom(this.http.post<{ ok: boolean; text: string; refresh?: boolean }>('/api/chat/action', { kind, payload }));
  }

  exportUrl(kind: 'csv' | 'xlsx' | 'pdf' | 'qr-pdf', view?: string, id?: string, inline = false): string {
    const params = new URLSearchParams();
    if (view) params.set('view', view);
    if (id) params.set('id', id);
    if (inline) params.set('inline', '1');
    const q = params.toString();
    return `/api/export/${kind}${q ? `?${q}` : ''}`;
  }
}
