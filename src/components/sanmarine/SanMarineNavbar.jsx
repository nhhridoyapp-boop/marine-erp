import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  LayoutGrid, PlusCircle, FileSpreadsheet, FileText, LogOut, Anchor, Search, Clock, ShieldAlert,
  UserCheck, Lock, History, FileCheck, Ship, MapPin, Building, Users, Settings, Menu, X,
  RefreshCw, Package, Scale, ClipboardList, ShieldCheck,
} from 'lucide-react';
import ProfileAvatar from './ProfileAvatar';
import ProfileCard from './ProfileCard';
import { TAB_PATHS } from './SanMarineContext';

export default function SanMarineNavbar({
  currentUser, companyName, onLogout, onOpenGlobalSearch,
  alertCount = 0, pendingCount = 0, approvalCount = 0, isSyncing = false, lastSyncedTime = null, onManualSync,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [managementDropdownOpen, setManagementDropdownOpen] = useState(false);
  const [logoOk, setLogoOk] = useState(true);

  const role = currentUser?.role || 'Staff';
  const isMasterSuperAdmin = role === 'Master Super Admin';
  const isSuperAdmin = isMasterSuperAdmin || role === 'Super Admin';
  const isAdmin = role === 'Admin';
  const isAdminOrSuper = isSuperAdmin || isAdmin;
  const isOperationsAdmin = role === 'Operations Admin';
  const isSupervisor = role === 'Supervisor';

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileMenuOpen]);

  const handleSelectTab = (tabId) => { navigate(TAB_PATHS[tabId] || '/'); setMobileMenuOpen(false); setManagementDropdownOpen(false); };

  const mainNavItems = [
    { id: 'home', label: 'ড্যাশবোর্ড', sub: 'Dashboard', icon: LayoutGrid },
    { id: 'entry', label: 'নতুন এন্ট্রি', sub: 'New Entry', icon: PlusCircle, isPrimaryAction: true },
    { id: 'entries', label: 'সকল এন্ট্রি', sub: 'All Entries', icon: FileSpreadsheet },
    { id: 'alerts', label: 'অ্যালার্ট', sub: 'Alert Center', icon: ShieldAlert, badge: alertCount, badgeColor: 'bg-rose-600 text-white' },
    { id: 'pending', label: 'পেন্ডিং', sub: 'Pending Center', icon: Clock, badge: pendingCount, badgeColor: 'bg-amber-500 text-white' },
    { id: 'reports_san', label: 'SAN MARINE SURVEY & INSPECTION Reports', sub: 'SAN MARINE', icon: FileText },
    { id: 'reports_sea', label: 'SEAQUANT MARINE SERVICES Reports', sub: 'SEAQUANT', icon: FileText },
  ];

  const secondaryNavItems = [
    ...(isSuperAdmin ? [{ id: 'approvals', label: 'অনুমোদন কেন্দ্র', short: 'অনুমোদন', icon: UserCheck, badge: approvalCount, badgeColor: 'bg-purple-600 text-white' }] : []),
    { id: 'documents', label: 'ডেইলি ডকুমেন্টস ও খাতা', short: 'ডেইলি ডকুমেন্টস', icon: FileCheck },
    { id: 'ghat_summary', label: 'ঘাট সামারি (লাইভ)', short: 'ঘাট সামারি', icon: MapPin },
    { id: 'staff_daily', label: 'স্টাফ ডেইলি এন্ট্রি সামারি', short: 'স্টাফ সামারি', icon: ClipboardList },
    { id: 'lighter_summary', label: 'লাইটার আনলোড সামারি', short: 'লাইটার সামারি', icon: Anchor },
    { id: 'vessels', label: 'মাদার ভেসেল', short: 'মাদার ভেসেল', icon: Ship },
    { id: 'lighters', label: 'লাইটার ভেসেল', short: 'লাইটার', icon: Anchor },
    { id: 'ghats', label: 'ঘাট তালিকা', short: 'ঘাট', icon: MapPin },
    { id: 'consignees', label: 'আমদানিকারক / পার্টি', short: 'কনসাইনি', icon: Building },
    { id: 'cargos', label: 'কার্গো তালিকা', short: 'কার্গো', icon: Package },
    { id: 'scales', label: 'স্কেল ও ঘাট ম্যাপিং', short: 'স্কেল', icon: Scale },
    ...((isAdminOrSuper || isOperationsAdmin || isSupervisor) ? [{ id: 'closing', label: 'লাইটার ক্লোজিং', short: 'ক্লোজিং', icon: Lock }] : []),
    { id: 'truck_history', label: 'ট্রাক হিস্ট্রি', short: 'হিস্ট্রি', icon: History },
    ...(isAdminOrSuper ? [{ id: 'users', label: 'ইউজার ম্যানেজমেন্ট', short: 'ইউজার', icon: Users }] : []),
    ...(isSuperAdmin ? [{ id: 'audit', label: 'সিস্টেম অডিট লগ', short: 'অডিট', icon: ShieldAlert }] : []),
    ...(isSuperAdmin ? [{ id: 'data_safety', label: 'ডেটা সেফটি ও ব্যাকআপ', short: 'ডেটা সেফটি', icon: ShieldCheck }] : []),
    { id: 'settings', label: 'সিস্টেম সেটিংস', short: 'সেটিংস', icon: Settings },
  ];

  const isSecondaryActive = secondaryNavItems.some(i => (TAB_PATHS[i.id] || '/') === location.pathname);

  const NavBtn = ({ item, full = false }) => {
    const Icon = item.icon;
    const active = location.pathname === (TAB_PATHS[item.id] || '/');
    return (
      <button type="button" onClick={() => handleSelectTab(item.id)}
        className={`relative flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
          active ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
        } ${item.isPrimaryAction ? 'bg-amber-500 hover:bg-amber-500 text-slate-950' : ''} ${full ? 'w-full min-w-0 justify-start whitespace-normal text-left' : 'shrink-0'}`}>
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex min-w-0 flex-col items-start leading-tight">
          <span className="text-[12px] font-black">{item.label}</span>
          <span className={`text-[9px] font-semibold ${active ? 'text-teal-100' : 'text-slate-500'}`}>{item.sub}</span>
        </span>
        {item.badge ? <span className={`ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-mono font-black ${item.badgeColor}`}>{item.badge}</span> : null}
      </button>
    );
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-[#0f172a] text-white border-b border-slate-800 shadow-md" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2">
          <div className="flex flex-1 items-center space-x-2.5 sm:space-x-3.5 cursor-pointer select-none min-w-0" onClick={() => handleSelectTab('home')} title="ড্যাশবোর্ডে ফিরুন">
            <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl overflow-hidden bg-[#0B2A4A] border border-slate-700 flex items-center justify-center shrink-0 shadow-sm">
              {logoOk ? (
                <img src="/sanmarine-logo.png" alt="SAN MARINE SURVEY & INSPECTION" className="h-full w-full object-contain" onError={() => setLogoOk(false)} />
              ) : (
                <span className="text-[7px] sm:text-[8px] font-black text-teal-300 text-center leading-tight tracking-tight">SAN MARINE<br/>ERP</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="font-black text-xs sm:text-base text-white tracking-wide flex items-center gap-1.5 sm:gap-2 truncate">
                <span className="truncate">{companyName || 'SAN MARINE SURVEY & INSPECTION'}</span>
                <span className="hidden lg:inline-flex text-[9px] uppercase font-black tracking-widest px-2 py-0.5 rounded bg-teal-500/20 text-[#5eead4] border border-teal-500/40 shrink-0">SCALE ERP</span>
              </div>
              <div className="text-[10px] sm:text-[11px] text-slate-400 font-medium truncate flex items-center gap-2 mt-0.5">
                <span className="text-teal-400 font-bold hidden xs:inline">ডিসচার্জ ও মনিটরিং পোর্টাল</span>
                {currentUser && (<><span className="hidden xs:inline text-slate-600">·</span><span className="flex items-center gap-1.5 min-w-0"><span className="truncate">{currentUser.name} {currentUser.employeeId ? `(${currentUser.employeeId})` : ''}</span></span></>)}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 sm:space-x-3 shrink-0">
            <button type="button" onClick={onManualSync}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${isSyncing ? 'bg-teal-950/80 text-teal-300 border-teal-500/50' : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border-slate-700/60'}`}
              title="কেন্দ্রীয় ডাটাবেজ রিয়েল-টাইম সিঙ্ক">
              <RefreshCw className={`h-3 w-3 text-teal-400 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden lg:inline">{isSyncing ? 'সিঙ্ক হচ্ছে...' : 'Central DB Live'}</span>
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
            </button>

            {onOpenGlobalSearch && (
              <button type="button" onClick={onOpenGlobalSearch}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700/80 transition-colors"
                title="গ্লোবাল সার্চ (Ctrl+K)">
                <Search className="h-3.5 w-3.5 text-teal-400" />
                <span className="hidden md:inline text-[11px]">সার্চ...</span>
                <span className="hidden lg:inline text-[9px] text-slate-400 bg-slate-900 px-1 py-0.5 rounded font-mono border border-slate-800">Ctrl+K</span>
              </button>
            )}

            <div className="hidden sm:flex items-center gap-1.5">
              {alertCount > 0 && <span className="px-2 py-1 rounded-lg bg-rose-600/90 text-white text-[10px] font-bold flex items-center gap-1"><ShieldAlert className="h-3 w-3" />{alertCount}</span>}
              {pendingCount > 0 && <span className="px-2 py-1 rounded-lg bg-amber-500 text-slate-950 text-[10px] font-bold flex items-center gap-1"><Clock className="h-3 w-3" />{pendingCount}</span>}
            </div>

            {currentUser && (
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" aria-label="প্রোফাইল দেখুন" title="প্রোফাইল দেখুন" className="shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                    <ProfileAvatar className="h-10 w-10" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" sideOffset={8} collisionPadding={12} className="w-72 max-w-[calc(100vw-24px)] bg-slate-900 border-slate-700 p-2">
                  <ProfileCard user={currentUser} />
                </PopoverContent>
              </Popover>
            )}

            <button type="button" onClick={onLogout}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white text-[11px] font-bold border border-rose-500/50 transition-colors"
              title="লগআউট">
              <LogOut className="h-3.5 w-3.5" /><span className="hidden sm:inline">লগআউট</span>
            </button>

            <button type="button" onClick={() => setMobileMenuOpen(true)} className="md:hidden p-2 rounded-xl bg-slate-800 text-slate-200 border border-slate-700">
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Wrap primary options; the portalled menu cannot be clipped by the header. */}
        <nav aria-label="প্রধান নেভিগেশন" className="max-w-7xl mx-auto px-3 sm:px-6 pb-2 hidden md:flex flex-wrap items-center gap-1.5">
          {mainNavItems.map(item => <NavBtn key={item.id} item={item} />)}
          <Popover open={managementDropdownOpen} onOpenChange={setManagementDropdownOpen}>
            <PopoverTrigger asChild>
              <button type="button" aria-label="ব্যবস্থাপনার সব মেনু" aria-expanded={managementDropdownOpen}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${isSecondaryActive || managementDropdownOpen ? 'bg-slate-800 text-teal-300' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
                <Settings className="h-4 w-4" /><span>ব্যবস্থাপনা</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" side="bottom" collisionPadding={12} sideOffset={8}
              className="w-64 max-w-[calc(100vw-24px)] max-h-[min(70dvh,var(--radix-popover-content-available-height))] overflow-y-auto overscroll-contain bg-slate-900 text-white border-slate-700 rounded-2xl shadow-2xl p-2 grid grid-cols-1 gap-1">
              {secondaryNavItems.map(item => <NavBtn key={item.id} item={item} full />)}
            </PopoverContent>
          </Popover>
        </nav>
      </header>

      {/* Mobile bottom-ish quick nav (visible on small screens) */}
      <div className="md:hidden sticky z-30 bg-[#0f172a]/95 backdrop-blur border-b border-slate-800 px-2 py-1.5 flex items-center gap-1 overflow-x-auto" style={{ top: 'calc(57px + env(safe-area-inset-top))' }}>
        {mainNavItems.map(item => {
          const Icon = item.icon; const active = location.pathname === (TAB_PATHS[item.id] || '/');
          return (
            <button key={item.id} type="button" onClick={() => handleSelectTab(item.id)}
              className={`relative flex flex-col items-center justify-center px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap ${active ? 'bg-teal-600 text-white' : 'text-slate-300'}`}>
              <Icon className="h-4 w-4" />
              {item.badge ? <span className="absolute -top-0.5 -right-0.5 px-1 rounded-full bg-rose-500 text-white text-[8px]">{item.badge}</span> : null}
            </button>
          );
        })}
        <button type="button" onClick={() => setMobileMenuOpen(true)} className="flex flex-col items-center justify-center px-2.5 py-1 rounded-lg text-[10px] font-bold text-slate-300">
          <Menu className="h-4 w-4" />আরও
        </button>
      </div>

      {/* Mobile full menu drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-[82%] max-w-sm bg-[#0f172a] border-l border-slate-800 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <span className="font-black text-white text-sm">মেনু</span>
              <button onClick={() => setMobileMenuOpen(false)} className="p-1.5 rounded-lg bg-slate-800 text-slate-200"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              <div className="pb-2"><ProfileCard user={currentUser} /></div>
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 px-2 pt-2 pb-1">প্রাথমিক</div>
              {mainNavItems.map(item => <NavBtn key={item.id} item={item} full />)}
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 px-2 pt-3 pb-1">ব্যবস্থাপনা</div>
              {secondaryNavItems.map(item => <NavBtn key={item.id} item={item} full />)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}