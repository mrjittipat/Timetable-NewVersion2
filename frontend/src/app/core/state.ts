import { Injectable, computed, inject, signal } from '@angular/core';
import { Api } from './api';
import { DataResponse, Term, TermSummary, TimetableResponse } from './models';
import { TermStore } from './term';

@Injectable({ providedIn: 'root' })
export class AppState {
  private readonly api = inject(Api);
  private readonly termStore = inject(TermStore);

  readonly term = this.termStore.term;
  readonly terms = signal<TermSummary[]>([]);
  readonly data = signal<DataResponse | null>(null);
  readonly timetable = signal<TimetableResponse | null>(null);
  readonly loading = signal(false);
  readonly version = signal(0);

  readonly termLabel = computed(() => (this.term() === '1' ? 'ภาคเรียนที่ 1' : 'ภาคเรียนที่ 2'));
  readonly hasTimetable = computed(() => Boolean(this.timetable()?.rows?.length));
  readonly validationPassed = computed(() => Boolean(this.timetable()?.validation?.passed));

  bump() {
    this.version.update((v) => v + 1);
  }

  async refreshTerms() {
    const res = await this.api.getTerms();
    this.terms.set(res.terms);
    return res;
  }

  async refreshData() {
    const res = await this.api.getData();
    this.data.set(res);
    return res;
  }

  async refreshTimetable() {
    const res = await this.api.getTimetable();
    this.timetable.set(res);
    return res;
  }

  async setTerm(term: Term) {
    const next: Term = term === '1' ? '1' : '2';
    this.termStore.set(next);
    await this.refresh();
  }

  async refresh() {
    this.loading.set(true);
    try {
      await Promise.all([this.refreshData(), this.refreshTimetable(), this.refreshTerms()]);
      this.bump();
    } finally {
      this.loading.set(false);
    }
  }
}
