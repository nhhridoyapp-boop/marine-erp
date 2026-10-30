import { base44 } from '@/api/base44Client';
import { runLimited } from '@/lib/sanmarineNet';

export default async function companyReviewRows(queries, cursor) {
  const specs = [
    ['consignees', 'Consignee', ['name', 'company']],
    ['entries', 'TruckEntry', ['truckNumber', 'company', 'motherVesselId', 'lighterVesselId']],
    ['empties', 'EmptyWeight', ['truckNumber', 'company', 'emptyWeightDate', 'loadingEntryId']],
    ['documents', 'LighterDailyDocument', ['date', 'company', 'lighterVesselName', 'motherVesselId', 'lighterVesselId']],
    ['alerts', 'Alert', ['title', 'truckNumber', 'company', 'relatedLoadingId', 'relatedEmptyId']],
  ];
  const pages = await runLimited(specs.map(([key, name, fields]) => async () => {
    const entity = base44.entities[name];
    const page = cursor && !cursor[key] ? { items: [], has_more: false } : await entity.filter(queries[key], { limit: 50, cursor: cursor?.[key], fields });
    const count = await entity.count(queries[key]);
    return [key, { items: page.items, count, next: page.has_more ? page.next_cursor : null }];
  }), 2);
  return Object.fromEntries(pages);
}