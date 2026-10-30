import { useState, useEffect } from "react"
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import SanMarineApp from '@/components/sanmarine/SanMarineApp';
import StartupScreen from '@/components/sanmarine/StartupScreen';
import UpdateBanner from '@/components/UpdateBanner';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
// Add page imports here

// Hard ceiling on the startup splash screen. However slow the server or the network is, the app shell must
// appear: the app carries its own saved session, so it can open and keep loading data behind the scenes.
const GATE_LIMIT_MS = 6000;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, checkAppState } = useAuth();

  const { pathname } = useLocation();
  const authPage = ['/login', '/register', '/forgot-password', '/reset-password'].includes(pathname);

  // Once this ceiling passes the splash screen is skipped for good, even if the checks are still running.
  const [gateExpired, setGateExpired] = useState(false);
  useEffect(() => { const t = setTimeout(() => setGateExpired(true), GATE_LIMIT_MS); return () => clearTimeout(t); }, []);

  // Login and recovery routes must remain accessible even when the app needs authentication.
  if (!authPage && !gateExpired && (isLoadingPublicSettings || isLoadingAuth)) {
    return <StartupScreen state="loading" message="অ্যাপ চালু হচ্ছে..." onRetry={checkAppState} />;
  }

  // Handle authentication errors
  if (!authPage && authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Never auto-redirect (that left a blank page): show a readable message with Retry / Login buttons.
      return (
        <StartupScreen
          state="error"
          message="সেশন যাচাই করা যায়নি। আবার চেষ্টা করুন অথবা লগইন করুন।"
          onRetry={checkAppState}
          secondary={{ label: 'লগইন', onClick: navigateToLogin }}
        />
      );
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      {/* Add your page Route elements here */}
      <Route path="/*" element={<SanMarineApp />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
        <UpdateBanner />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App