import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/auth';
import { Shell } from './layout/shell';

export const routes: Routes = [
  {
    path: 'login',
    title: 'เข้าสู่ระบบ',
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
  },
  {
    path: 'p',
    title: 'ตารางเรียนสาธารณะ',
    loadComponent: () => import('./pages/public/public').then((m) => m.PublicPage),
  },
  {
    path: 'p/:view/:id',
    title: 'ตารางเรียนสาธารณะ',
    loadComponent: () => import('./pages/public/public').then((m) => m.PublicPage),
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', title: 'ภาพรวม', loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.DashboardPage) },
      { path: 'data', title: 'จัดการข้อมูล', loadComponent: () => import('./pages/data/data').then((m) => m.DataPage) },
      { path: 'solve', title: 'จัดตาราง', loadComponent: () => import('./pages/solve/solve').then((m) => m.SolvePage) },
      { path: 'timetable', title: 'ตารางเรียน', loadComponent: () => import('./pages/timetable/timetable').then((m) => m.TimetablePage) },
      {
        path: 'teacher-summary',
        title: 'สรุปภาระสอนครู',
        loadComponent: () => import('./pages/teacher-summary/teacher-summary').then((m) => m.TeacherSummaryPage),
      },
      { path: 'report', title: 'ผลตรวจเงื่อนไข', loadComponent: () => import('./pages/report/report').then((m) => m.ReportPage) },
      { path: 'export', title: 'ส่งออก', loadComponent: () => import('./pages/export/export').then((m) => m.ExportPage) },
      { path: 'settings', title: 'ตั้งค่า', loadComponent: () => import('./pages/settings/settings').then((m) => m.SettingsPage) },
      {
        path: 'users',
        canActivate: [adminGuard, () => inject(Router).createUrlTree(['/settings'], { queryParams: { tab: 'users' } })],
        children: [],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
