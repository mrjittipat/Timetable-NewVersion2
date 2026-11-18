import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { AppState } from '../../core/state';
import { Icon } from '../../shared/icon';
import { PdfPreview } from '../../shared/pdf-preview';

@Component({
  selector: 'app-export-page',
  standalone: true,
  imports: [RouterLink, Icon, PdfPreview],
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <div class="eyebrow">ขั้นตอนที่ 4 · {{ state.termLabel() }}</div>
          <h1>ส่งออกไฟล์</h1>
          <p class="muted">ดาวน์โหลดผลตารางเรียนเป็น CSV, Excel, PDF แบบฟอร์มวิทยาลัย และ QR Code</p>
        </div>
      </header>

      @if (!state.hasTimetable()) {
        <section class="card card-body empty">
          <app-icon name="download" [size]="34" />
          <h3>ยังไม่มีตารางเรียนสำหรับส่งออก</h3>
          <a class="btn primary" routerLink="/solve">ไปหน้าจัดตารางอัตโนมัติ</a>
        </section>
      } @else {
        <section class="grid-2">
          <div class="card">
            <div class="card-head">
              <h3>output.csv</h3>
              <span class="badge neutral">UTF-8 · No BOM</span>
            </div>
            <div class="card-body col-gap">
              <p class="small muted">ไฟล์ผลลัพธ์มาตรฐาน 5 คอลัมน์: group_id, timeslot_id, subject_id, teacher_id, room_id</p>
              <div class="row">
                <a class="btn primary" [href]="api.exportUrl('csv')" download="output.csv">
                  <app-icon name="download" [size]="16" /> ดาวน์โหลด output.csv
                </a>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <h3>Excel (.xlsx)</h3>
              <span class="badge neutral">TH SarabunPSK</span>
            </div>
            <div class="card-body col-gap">
              <p class="small muted">เอกสารตารางเรียน/ตารางสอนแบบฟอร์มวิทยาลัย พร้อมชีต output รวมข้อมูลดิบ</p>
              <div class="row">
                <a class="btn primary" [href]="api.exportUrl('xlsx', 'all')" target="_blank">ทั้งหมด (รวม 1 ไฟล์)</a>
                <a class="btn sm" [href]="api.exportUrl('xlsx', 'group')" target="_blank">กลุ่มเรียน</a>
                <a class="btn sm" [href]="api.exportUrl('xlsx', 'teacher')" target="_blank">ครูผู้สอน</a>
                <a class="btn sm" [href]="api.exportUrl('xlsx', 'room')" target="_blank">ห้องเรียน</a>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <h3>PDF (A4 แนวนอน)</h3>
              <span class="badge neutral">แบบฟอร์มทางการ</span>
            </div>
            <div class="card-body col-gap">
              <p class="small muted">แสดงโลโก้ ตารางรายวิชา ท. ป. น. ช. ตารางรายวัน และช่องลงนาม 4 ตำแหน่ง</p>
              <div class="row">
                <button type="button" class="btn primary" (click)="openPdf('all')">ดูตัวอย่างทั้งหมด</button>
                <button type="button" class="btn sm" (click)="openPdf('group')">กลุ่มเรียน</button>
                <button type="button" class="btn sm" (click)="openPdf('teacher')">ครูผู้สอน</button>
                <button type="button" class="btn sm" (click)="openPdf('room')">ห้องเรียน</button>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <h3>QR code ติดหน้าห้อง</h3>
              <span class="badge neutral">A4 แนวตั้ง 2×3</span>
            </div>
            <div class="card-body col-gap">
              <p class="small muted">การ์ด QR Code สำหรับสแกนเปิดตารางล่าสุดผ่านมือถือโดยไม่ต้องเข้าสู่ระบบ</p>
              <div class="row">
                <button type="button" class="btn sm" (click)="openQrPdf('group')">QR กลุ่มเรียน</button>
                <button type="button" class="btn sm" (click)="openQrPdf('teacher')">QR ครูผู้สอน</button>
                <button type="button" class="btn sm" (click)="openQrPdf('room')">QR ห้องเรียน</button>
                <a class="btn primary sm" routerLink="/p" [queryParams]="{ term: state.term() }">เปิดหน้าตารางสาธารณะ</a>
              </div>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <h3>ตัวอย่างข้อมูล output.csv (12 แถวแรก จากทั้งหมด {{ state.timetable()?.rows?.length || 0 }} แถว)</h3>
          </div>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>group_id</th>
                  <th>timeslot_id</th>
                  <th>subject_id</th>
                  <th>teacher_id</th>
                  <th>room_id</th>
                </tr>
              </thead>
              <tbody>
                @for (r of previewRows(); track $index) {
                  <tr>
                    <td class="mono">{{ r.group_id }}</td>
                    <td class="mono">{{ r.timeslot_id }}</td>
                    <td class="mono">{{ r.subject_id }}</td>
                    <td class="mono">{{ r.teacher_id }}</td>
                    <td class="mono">{{ r.room_id }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    </div>

    <app-pdf-preview [url]="pdfUrl()" (closed)="pdfUrl.set(null)" />
  `,
  styles: `
    .col-gap {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
  `,
})
export class ExportPage {
  readonly state = inject(AppState);
  readonly api = inject(Api);
  readonly pdfUrl = signal<string | null>(null);

  readonly previewRows = computed(() => (this.state.timetable()?.rows || []).slice(0, 12));

  openPdf(view: string) {
    this.pdfUrl.set(this.api.exportUrl('pdf', view, undefined, true));
  }

  openQrPdf(view: string) {
    this.pdfUrl.set(this.api.exportUrl('qr-pdf', view, undefined, true));
  }
}
