import React from 'react';
import { PlusCircle, Scale, Truck } from 'lucide-react';
import EmptyWeightForm from './EmptyWeightForm';
import LoadingForm from './LoadingForm';
import { PageShell, PageHeader } from './formParts';

export default function EntryHub({ mode, setMode, truckNo, ghats, vessels, lighters, cargos, scales, emptyWeights, entries = [], closings, currentUser, rules, onSaved }) {
  const tabs = [
    { id: 'empty', label: 'খালি গাড়ী ওজন', icon: Scale },
    { id: 'loading', label: 'লোড গাড়ী ওজন', icon: Truck },
  ];
  // Recent truck numbers from both unlinked empty weights and loads without empty —
  // used only for autocomplete suggestions; never creates duplicate master records.
  const truckSuggestions = [...new Set([
    ...(emptyWeights || []).map((e) => e.truckNumber).filter(Boolean),
    ...entries.map((e) => e.truckNumber).filter(Boolean),
  ])].sort();
  return (
    <PageShell>
      <PageHeader icon={PlusCircle} title="নতুন এন্ট্রি" sub="খালি ওজন ও লোড ওজন রেকর্ড" />
      <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl text-xs font-bold">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} type="button" onClick={() => setMode(t.id)}
              className={`py-2.5 rounded-lg flex items-center justify-center gap-1.5 ${mode === t.id ? 'bg-white text-teal-800 shadow-sm font-black' : 'text-slate-500'}`}>
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>
      {mode === 'loading'
        ? <LoadingForm key={`l-${truckNo}`} vessels={vessels} lighters={lighters} ghats={ghats} cargos={cargos} scales={scales} emptyWeights={emptyWeights} closings={closings} currentUser={currentUser} rules={rules} initialTruck={truckNo} truckSuggestions={truckSuggestions} onSaved={onSaved} />
        : <EmptyWeightForm key={`e-${truckNo}`} ghats={ghats} vessels={vessels} lighters={lighters} scales={scales} currentUser={currentUser} rules={rules} initialTruck={truckNo} truckSuggestions={truckSuggestions} onSaved={onSaved} />}
    </PageShell>
  );
}