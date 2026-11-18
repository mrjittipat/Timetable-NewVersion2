import { Injectable, computed, inject, signal } from '@angular/core';
import { Api } from './api';
import { DataResponse, TimetableResponse } from './models';

@Injectable({ providedIn: 'root' })
export class AppState {
  private readonly api = inject(Api);

  readonly data = signal<DataResponse | null>(null);
  readonly timetable = signal<TimetableResponse | null>(null);
  readonly loading = signal(false);
  readonly version = signal(0);

  readonly hasTimetable = computed(() => Boolean(this.timetable()?.rows?.length));
  readonly validationPassed = computed(() => Boolean(this.timetable()?.validation?.passed));

  bump() {
    this.version.update((v) => v + 1);
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

  async refresh() {
    this.loading.set(true);
    try {
      await Promise.all([this.refreshData(), this.refreshTimetable()]);
      this.bump();
    } finally {
      this.loading.set(false);
    }
  }
}
