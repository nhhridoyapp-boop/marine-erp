import { base44 } from '@/api/base44Client';
import { andQuery } from '@/components/sanmarine/company/companyScope';
export default function companyReportEntities(scope) {
  if (!scope?.company) throw new Error('কোম্পানির রিপোর্টের সীমা যাচাই হয়নি।');
  const rules = { TruckEntry: scope.trucks, EmptyWeight: scope.empty, Alert: scope.alerts, LighterDailyDocument: scope.docs, VesselClosing: scope.closings };
  return Object.fromEntries(Object.entries(rules).map(([name, rule]) => [name, {
    filter: (query, options) => base44.entities[name].filter(andQuery(rule, query), options),
    count: (query) => base44.entities[name].count(andQuery(rule, query)),
    aggregate: (options) => base44.entities[name].aggregate({ ...options, query: andQuery(rule, options.query) }),
  }]));
}