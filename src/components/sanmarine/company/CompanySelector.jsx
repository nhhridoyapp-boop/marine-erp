import React from 'react';
import { COMPANIES } from '@/components/sanmarine/company/companyScope';
export default function CompanySelector({ company, onChange, reports = false }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-2" role="group" aria-label="কোম্পানি নির্বাচন">
    {COMPANIES.map((name) => <button key={name} type="button" aria-pressed={company === name} onClick={() => onChange(name)} className={`rounded-xl border p-3 text-left text-xs font-semibold break-words ${company === name ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-card-foreground border-border'}`}>{name}{reports ? ' Reports' : ''}</button>)}
  </div>;
}