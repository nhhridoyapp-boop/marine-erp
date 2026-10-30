import React from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import StartupScreen from './StartupScreen';
import { resetAppShellAndReload } from '@/lib/startupGuard';

const CHUNK_RX = /dynamically imported module|Loading chunk|Importing a module script failed|error loading dynamically/i;

// Catches render/runtime errors so a crash shows a readable message + Retry instead of a blank white screen.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.reset = () => this.setState({ error: null });
  }

  static getDerivedStateFromError(error) { return { error }; }

  componentDidMount() { if (window.__smBootDone) window.__smBootDone(); }

  componentDidCatch(error, info) {
    console.error('App error:', error, info && info.componentStack);
    if (CHUNK_RX.test(String((error && error.message) || ''))) {
      // A new version was published while this screen was open: refresh the app files once automatically.
      let tried = false;
      try { tried = sessionStorage.getItem('sm_chunk_reload') === '1'; sessionStorage.setItem('sm_chunk_reload', '1'); } catch (e) { /* ignore */ }
      if (!tried) resetAppShellAndReload();
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const detail = String((error && error.message) || error).slice(0, 180);
    if (this.props.inline) {
      return (
        <div className="m-4 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 space-y-2">
          <div className="flex items-center gap-2 text-sm font-black"><AlertTriangle className="h-4 w-4" /> এই পাতাটি দেখাতে সমস্যা হয়েছে</div>
          <p className="text-[11px] font-mono break-words text-rose-700">{detail}</p>
          <button type="button" onClick={this.reset} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold"><RefreshCw className="h-3.5 w-3.5" /> আবার চেষ্টা করুন</button>
        </div>
      );
    }
    return <StartupScreen state="error" message="অ্যাপ চালু করতে একটি সমস্যা হয়েছে।" detail={detail} onRetry={this.reset} />;
  }
}