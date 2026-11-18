import { Component, input, output, signal } from '@angular/core';
import { Grid, GridSpan, View } from '../../core/models';

export interface SpanDropEvent {
  fromDay: string;
  fromPeriod: number;
  length: number;
  toDay: string;
  toPeriod: number;
}

export interface SpanSelectEvent {
  day: string;
  dayLabel: string;
  span: GridSpan;
}

@Component({
  selector: 'app-timetable-sheet',
  standalone: true,
  template: `
    <div class="sheet-wrap">
      <table class="tt-table">
        <thead>
          <tr>
            <th class="day-head" rowspan="2">วัน / เวลา</th>
            @for (p of grid().periods; track p.period) {
              <th [class.break-head]="p.isBreak || p.isHomeroom">
                <div>คาบ {{ p.period }}</div>
                <small>{{ p.start }}-{{ p.end }}</small>
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (d of grid().days; track d.key; let di = $index) {
            <tr>
              <th class="day-cell">{{ d.label }}</th>
              @for (slot of rowCells(di); track $index) {
                @if (slot.kind === 'homeroom' || slot.kind === 'break') {
                  <td class="break-cell">
                    <span>{{ slot.label }}</span>
                  </td>
                } @else if (slot.kind === 'span' && slot.span) {
                  @let sp = slot.span;
                  <td
                    [attr.colspan]="sp.span"
                    class="span-td"
                    [class.clash]="sp.clash"
                    [class.drop-over]="isOver(d.key, sp.start)"
                    (dragover)="onDragOver($event, d.key, sp.start)"
                    (dragleave)="clearOver(d.key, sp.start)"
                    (drop)="onDrop($event, d.key, sp.start)"
                  >
                    <button
                      type="button"
                      class="span-btn"
                      [attr.draggable]="editable()"
                      (dragstart)="onDragStart($event, d.key, sp)"
                      (click)="spanSelect.emit({ day: d.key, dayLabel: d.label, span: sp })"
                    >
                      <strong class="sid">{{ sp.subject_id }}</strong>
                      @if (sp.span > 1) {
                        <span class="sname">{{ sp.subject_name }}</span>
                      }
                      <span class="who">{{ whoText(sp) }}</span>
                      @if (view() !== 'room' && sp.room) {
                        <span class="room">{{ sp.room }}</span>
                      }
                    </button>
                  </td>
                } @else {
                  <td
                    class="empty-cell"
                    [class.drop-over]="isOver(d.key, slot.period!)"
                    (dragover)="onDragOver($event, d.key, slot.period!)"
                    (dragleave)="clearOver(d.key, slot.period!)"
                    (drop)="onDrop($event, d.key, slot.period!)"
                  ></td>
                }
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    .sheet-wrap {
      overflow-x: auto;
    }
    .tt-table {
      width: 100%;
      min-width: 900px;
      border-collapse: collapse;
      table-layout: fixed;
      background: var(--surface);
    }
    .tt-table th,
    .tt-table td {
      border: 1px solid var(--border-strong);
      text-align: center;
      vertical-align: middle;
    }
    thead th {
      background: var(--maroon-700);
      color: #fff;
      padding: 7px 4px;
      font-size: 12.5px;
      font-weight: 600;
    }
    thead th small {
      display: block;
      font-weight: 400;
      font-size: 10.5px;
      opacity: 0.9;
    }
    thead th.break-head {
      background: var(--maroon-600);
    }
    .day-head {
      width: 82px;
    }
    .day-cell {
      background: var(--maroon-50);
      color: var(--maroon-900);
      font-weight: 700;
      padding: 8px 6px;
      height: 78px;
    }
    .break-cell {
      background: #f6f1f2;
      color: var(--text-muted);
      font-weight: 600;
      font-size: 12px;
    }
    .empty-cell {
      height: 78px;
      transition: background 0.12s var(--ease);
    }
    .span-td {
      padding: 3px;
      height: 78px;
      background: #fff;
    }
    .span-td.clash {
      outline: 2px dashed var(--danger);
      outline-offset: -3px;
      background: var(--danger-bg);
    }
    .drop-over {
      background: var(--maroon-100) !important;
      box-shadow: inset 0 0 0 2px var(--maroon-700);
    }
    .span-btn {
      width: 100%;
      height: 100%;
      border: 1px solid var(--maroon-200);
      border-radius: var(--radius-sm);
      background: var(--maroon-50);
      padding: 5px 6px;
      font: inherit;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      text-align: center;
      overflow: hidden;
    }
    .span-btn:hover {
      border-color: var(--maroon-700);
      background: var(--maroon-100);
    }
    .sid {
      font-size: 12px;
      color: var(--maroon-800);
      line-height: 1.15;
    }
    .sname {
      font-size: 11px;
      color: var(--text);
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .who,
    .room {
      font-size: 11px;
      color: var(--text-muted);
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
})
export class TimetableSheet {
  readonly grid = input.required<Grid>();
  readonly view = input.required<View>();
  readonly editable = input(false);

  readonly spanSelect = output<SpanSelectEvent>();
  readonly spanMove = output<SpanDropEvent>();

  private readonly overCell = signal<string>('');
  private dragging: { day: string; start: number; span: number } | null = null;

  rowCells(dayIdx: number) {
    const g = this.grid();
    const spans = new Map((g.cells[dayIdx] || []).map((s) => [s.start, s]));
    const out: { kind: 'homeroom' | 'break' | 'span' | 'empty'; label?: string; span?: GridSpan; period?: number }[] = [];
    const ps = g.periods;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.isHomeroom) {
        out.push({ kind: 'homeroom', label: 'Homeroom' });
        continue;
      }
      if (p.isBreak) {
        out.push({ kind: 'break', label: 'พัก' });
        continue;
      }
      const sp = spans.get(p.period);
      if (sp) {
        out.push({ kind: 'span', span: sp });
        i += sp.span - 1;
      } else {
        out.push({ kind: 'empty', period: p.period });
      }
    }
    return out;
  }

  whoText(sp: GridSpan) {
    const v = this.view();
    const g = (sp.groups || []).join('+');
    if (v === 'teacher') return g;
    if (v === 'group') return sp.teacher;
    return `${g} ${sp.teacher}`.trim();
  }

  onDragStart(e: DragEvent, day: string, sp: GridSpan) {
    if (!this.editable()) return;
    this.dragging = { day, start: sp.start, span: sp.span };
    e.dataTransfer?.setData('application/json', JSON.stringify(this.dragging));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  onDragOver(e: DragEvent, day: string, period: number) {
    if (!this.editable()) return;
    e.preventDefault();
    this.overCell.set(`${day}|${period}`);
  }

  clearOver(day: string, period: number) {
    if (this.overCell() === `${day}|${period}`) this.overCell.set('');
  }

  isOver(day: string, period: number) {
    return this.overCell() === `${day}|${period}`;
  }

  onDrop(e: DragEvent, toDay: string, toPeriod: number) {
    if (!this.editable()) return;
    e.preventDefault();
    this.overCell.set('');
    let src = this.dragging;
    if (!src) {
      try {
        src = JSON.parse(e.dataTransfer?.getData('application/json') || 'null');
      } catch {
        src = null;
      }
    }
    this.dragging = null;
    if (!src) return;
    if (src.day === toDay && src.start === toPeriod) return;
    this.spanMove.emit({
      fromDay: src.day,
      fromPeriod: src.start,
      length: src.span,
      toDay,
      toPeriod,
    });
  }
}
