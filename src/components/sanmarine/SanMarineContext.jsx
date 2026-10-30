import { createContext, useContext } from 'react';

const SanMarineContext = createContext(null);

export function SanMarineProvider({ children, value }) {
  return <SanMarineContext.Provider value={value}>{children}</SanMarineContext.Provider>;
}

export function useSanMarine() {
  const ctx = useContext(SanMarineContext);
  if (!ctx) throw new Error('useSanMarine must be used within SanMarineProvider');
  return ctx;
}

export const TAB_PATHS = {
  home: '/',
  entry: '/entry',
  entries: '/entries',
  alerts: '/alerts',
  pending: '/pending',
  reports_san: '/reports/san-marine',
  reports_sea: '/reports/seaquant',
  approvals: '/approvals',
  documents: '/documents',
  ghat_summary: '/ghat-summary',
  staff_daily: '/staff-daily',
  lighter_summary: '/lighter-summary',
  vessels: '/master/vessels',
  lighters: '/master/lighters',
  ghats: '/master/ghats',
  consignees: '/master/consignees',
  cargos: '/master/cargos',
  scales: '/scales',
  closing: '/closing',
  truck_history: '/truck-history',
  users: '/users',
  audit: '/audit',
  data_safety: '/data-safety',
  settings: '/settings',
};

export function pathToTab(pathname) {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/master/')) return pathname.split('/')[2];
  if (pathname.startsWith('/reports/')) return 'reports';
  for (const [tab, path] of Object.entries(TAB_PATHS)) {
    if (pathname === path) return tab;
  }
  return 'home';
}