import { api } from '@/lib/sanmarineApi';
import { ensureDailyBackup, safeVersionUpgrade, APP_VERSION } from '@/lib/sanmarineBackup';
import { toast } from '@/components/ui/use-toast';

// Data-safety background work (version upgrade check + daily backup). It is heavy, so it only runs AFTER the dashboard has
// loaded, one task at a time, and never from two tabs of the same device together.
const LOCK_KEY = 'sm_safety_lock';
const TRY_KEY = 'sm_upgrade_try';
const LOCK_MS = 15 * 60 * 1000;
const RETRY_MS = 30 * 60 * 1000;

const read = (k) => { try { return Number(localStorage.getItem(k) || 0); } catch (e) { return 0; } };
const write = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, String(v)); } catch (e) { /* ignore */ } };
const datePart = (v) => String(v || '').slice(0, 10);

export async function runSafetyTasks(user) {
  if (Date.now() - read(LOCK_KEY) < LOCK_MS) return;
  write(LOCK_KEY, Date.now());
  try {
    const s = await api.getErpSettings();
    // Only a NEWER build upgrades/stamps. An older cached copy of the app can never overwrite a newer version stamp.
    const needsUpgrade = s.appVersion !== APP_VERSION && datePart(APP_VERSION) >= datePart(s.appVersion);
    if (needsUpgrade && Date.now() - read(TRY_KEY) > RETRY_MS) {
      write(TRY_KEY, Date.now());
      const r = await safeVersionUpgrade(user, s.appVersion);
      await api.addAuditLog({
        userId: user.id, userName: user.name, userRole: user.role, recordType: 'System',
        action: r.ok ? 'VERSION_UPGRADE_OK' : 'VERSION_UPGRADE_BLOCKED',
        details: r.ok ? `${s.appVersion || '?'} → ${APP_VERSION}: ব্যাকআপ ভেরিফাইড (${r.total} রেকর্ড), ডাটাবেস যাচাই ✓` : `${r.stage}: ${r.details}`,
      }).catch(() => {});
      if (r.ok) await api.updateSettings({ appVersion: APP_VERSION });
      else toast({ title: 'ভার্সন আপডেটের নিরাপত্তা যাচাই ব্যর্থ', description: `${r.stage}: ${r.details} — ডাটা অক্ষত আছে, কিছুক্ষণ পর আবার চেষ্টা হবে।`, variant: 'destructive' });
    }
    await ensureDailyBackup(user);
  } catch (e) {
    // Network/server trouble: nothing was changed; it is tried again in a later session.
  } finally {
    write(LOCK_KEY, null);
  }
}