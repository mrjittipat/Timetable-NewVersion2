import { HttpInterceptorFn } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';

export type Term = '1' | '2';

function readInitialTerm(): Term {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('tt-term') === '1') {
      return '1';
    }
  } catch {
    // ignore storage errors
  }
  return '2';
}

@Injectable({ providedIn: 'root' })
export class TermStore {
  readonly term = signal<Term>(readInitialTerm());

  set(t: Term) {
    const next: Term = t === '1' ? '1' : '2';
    this.term.set(next);
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem('tt-term', next);
    } catch {
      // ignore
    }
  }
}

export const termInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/') || req.headers.has('X-Term') || req.url.startsWith('/api/public/')) {
    return next(req);
  }
  const t = inject(TermStore).term();
  return next(req.clone({ setHeaders: { 'X-Term': t } }));
};
