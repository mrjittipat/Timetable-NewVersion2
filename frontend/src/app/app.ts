import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmDialog } from './shared/confirm-dialog';
import { ToastStack } from './shared/toasts';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ConfirmDialog, ToastStack],
  template: `
    <router-outlet />
    <app-confirm-dialog />
    <app-toasts />
  `,
})
export class App {}
