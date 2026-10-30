import React, { useState, useEffect } from 'react';
import { Routes, Route, useParams, useSearchParams, useNavigate, Navigate } from 'react-router-dom';
import { useSanMarine } from './SanMarineContext';
import { COMPANIES } from './company/companyScope';
import SanMarineDashboard from './SanMarineDashboard';
import DashboardPlaceholder from './DashboardPlaceholder';
import CompanySelector from './company/CompanySelector';
import EntryHub from './EntryHub';
import EntriesList from './EntriesList';
import AlertCenter from './AlertCenter';
import PendingCenter from './PendingCenter';
import ReportsPage from './ReportsPage';
import ApprovalCenter from './ApprovalCenter';
import DailyDocuments from './DailyDocuments';
import GhatSummary from './GhatSummary';
import StaffDailySummary from './StaffDailySummary';
import LighterUnloadedSummary from './LighterUnloadedSummary';
import MasterData from './MasterData';
import ScaleMappings from './ScaleMappings';
import ClosingPage from './ClosingPage';
import TruckHistory from './TruckHistory';
import UserManagement from './UserManagement';
import AuditLogView from './AuditLogView';
import DataSafety from './DataSafety';
import SettingsPage from './SettingsPage';

function HomeRoute() {
  const { D, company, setCompany, currentUser, go } = useSanMarine();
  if (!D.stats) return (
    <>
      <div className="max-w-6xl mx-auto px-3.5 sm:px-6 pt-4">
        <CompanySelector company={company} onChange={setCompany} />
      </div>
      <DashboardPlaceholder syncing={D.isSyncing} error={!!D.connError || !!D.statsError} onRetry={D.refresh} />
    </>
  );
  return (
    <>
      <div className="max-w-6xl mx-auto px-3.5 sm:px-6 pt-4">
        <CompanySelector company={company} onChange={setCompany} />
        <p className="mt-2 text-xs text-muted-foreground">অনির্ধারিত Company-এর খালি ওজন/অ্যালার্ট এই কোম্পানির মোটে অন্তর্ভুক্ত নয়; Data Safety-এর Company Mapping Review দেখুন।</p>
      </div>
      <SanMarineDashboard key={company} company={company} stats={D.stats} vessels={D.stats.scope.vessels} lighters={D.stats.scope.lighters} alerts={D.alerts} approvals={D.approvals} todayEntries={D.todayEntries} currentUser={currentUser} onNavigate={go} />
    </>
  );
}

function EntryRoute() {
  const { D, currentUser } = useSanMarine();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState(searchParams.get('mode') || 'empty');
  const [truckNo, setTruckNo] = useState(searchParams.get('truck') || '');
  return (
    <EntryHub mode={mode} setMode={setMode} truckNo={truckNo} ghats={D.ghats} vessels={D.vessels} lighters={D.lighters} cargos={D.cargos} scales={D.scales} emptyWeights={D.emptyWeights} entries={D.entries} closings={D.closings} currentUser={currentUser} rules={D.rules} onSaved={D.refreshData} />
  );
}

function EntriesRoute() {
  const { D, currentUser, company } = useSanMarine();
  const [searchParams] = useSearchParams();
  const filter = searchParams.get('filter') || 'all';
  return (
    <EntriesList key={`${company}:${filter}`} scope={D.stats?.scope} initialFilter={filter} currentUser={currentUser} vessels={D.stats?.scope?.vessels || []} lighters={D.stats?.scope?.lighters || []} ghats={D.ghats} onChanged={D.refreshData} />
  );
}

function AlertsRoute() {
  const { D, currentUser } = useSanMarine();
  return <AlertCenter alerts={D.alerts} currentUser={currentUser} vessels={D.vessels} lighters={D.lighters} onRefresh={D.refreshData} />;
}

function PendingRoute() {
  const { D, go } = useSanMarine();
  return <PendingCenter emptyWeights={D.emptyWeights} entries={D.entries} onNavigate={go} />;
}

function ReportsRoute() {
  const { companySlug } = useParams();
  const { D, currentUser, setCompany } = useSanMarine();
  const navigate = useNavigate();
  const company = companySlug === 'seaquant' ? COMPANIES[1] : COMPANIES[0];
  useEffect(() => { setCompany(company); }, [company, setCompany]);
  const onCompanyChange = (c) => {
    setCompany(c);
    navigate(c === COMPANIES[1] ? '/reports/seaquant' : '/reports/san-marine');
  };
  return (
    <ReportsPage key={company} company={company} onCompanyChange={onCompanyChange} scope={D.stats?.scope} vessels={D.vessels} lighters={D.lighters} consignees={D.consignees} ghats={D.ghats} closings={D.closings} settings={D.settings} currentUser={currentUser} users={D.users} />
  );
}

function ApprovalsRoute() {
  const { D, currentUser } = useSanMarine();
  return <ApprovalCenter approvals={D.approvals} currentUser={currentUser} onRefresh={D.refresh} />;
}

function DocumentsRoute() {
  const { D, currentUser, company } = useSanMarine();
  return <DailyDocuments key={company} scope={D.stats?.scope} vessels={D.stats?.scope?.vessels || []} lighters={D.stats?.scope?.lighters || []} ghats={D.ghats} currentUser={currentUser} />;
}

function GhatSummaryRoute() {
  const { D } = useSanMarine();
  return <GhatSummary vessels={D.vessels} lighters={D.lighters} ghats={D.ghats} />;
}

function StaffDailyRoute() {
  const { D, currentUser } = useSanMarine();
  return <StaffDailySummary currentUser={currentUser} vessels={D.vessels} lighters={D.lighters} />;
}

function LighterSummaryRoute() {
  const { D } = useSanMarine();
  return <LighterUnloadedSummary vessels={D.vessels} lighters={D.lighters} />;
}

function MasterRoute() {
  const { type } = useParams();
  const { D, currentUser } = useSanMarine();
  const masterLookups = { vessels: D.vessels, lighters: D.lighters, consignees: D.consignees };
  return <MasterData type={type} items={D[type] || []} lookups={masterLookups} currentUser={currentUser} onRefresh={D.refresh} />;
}

function ScalesRoute() {
  const { D, currentUser } = useSanMarine();
  const masterLookups = { vessels: D.vessels, lighters: D.lighters, consignees: D.consignees };
  return <><MasterData type="scales" items={D.scales} lookups={masterLookups} currentUser={currentUser} onRefresh={D.refresh} /><ScaleMappings ghats={D.ghats} currentUser={currentUser} /></>;
}

function ClosingRoute() {
  const { D, currentUser } = useSanMarine();
  return <ClosingPage closings={D.closings} lighters={D.lighters} vessels={D.vessels} consignees={D.consignees} approvals={D.approvals} settings={D.settings} currentUser={currentUser} onRefresh={D.refresh} />;
}

function UsersRoute() {
  const { D, currentUser } = useSanMarine();
  return <UserManagement currentUser={currentUser} users={D.users} usersError={D.usersError} onRefresh={D.refresh} />;
}

function DataSafetyRoute() {
  const { currentUser } = useSanMarine();
  return <DataSafety currentUser={currentUser} />;
}

function SettingsRoute() {
  const { D, currentUser } = useSanMarine();
  return <SettingsPage settings={D.settings} currentUser={currentUser} onRefresh={D.refresh} />;
}

export default function SanMarineRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/entry" element={<EntryRoute />} />
      <Route path="/entries" element={<EntriesRoute />} />
      <Route path="/alerts" element={<AlertsRoute />} />
      <Route path="/pending" element={<PendingRoute />} />
      <Route path="/reports/san-marine" element={<ReportsRoute />} />
      <Route path="/reports/seaquant" element={<ReportsRoute />} />
      <Route path="/approvals" element={<ApprovalsRoute />} />
      <Route path="/documents" element={<DocumentsRoute />} />
      <Route path="/ghat-summary" element={<GhatSummaryRoute />} />
      <Route path="/staff-daily" element={<StaffDailyRoute />} />
      <Route path="/lighter-summary" element={<LighterSummaryRoute />} />
      {/* One parameter route: the list type (vessels/lighters/ghats/consignees/cargos) comes from the URL.
          The five separate paths below carried no ":type" param, so the page received an undefined type
          and crashed on the way in — for every role, which is why Staff/Supervisor could never add a lighter. */}
      <Route path="/master/:type" element={<MasterRoute />} />
      <Route path="/scales" element={<ScalesRoute />} />
      <Route path="/closing" element={<ClosingRoute />} />
      <Route path="/truck-history" element={<TruckHistory />} />
      <Route path="/users" element={<UsersRoute />} />
      <Route path="/audit" element={<AuditLogView />} />
      <Route path="/data-safety" element={<DataSafetyRoute />} />
      <Route path="/settings" element={<SettingsRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}