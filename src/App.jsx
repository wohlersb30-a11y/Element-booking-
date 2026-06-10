import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import BookSimulator from './pages/BookSimulator';
import MyReservations from './pages/MyReservations';
import AdminDashboard from './pages/AdminDashboard';
import AdminDashboardVadnaisHeights from './pages/AdminDashboardVadnaisHeights';
import AdminDashboardBurnsville from './pages/AdminDashboardBurnsville';
import PaymentSuccess from './pages/PaymentSuccess';
import MemberSignup from './pages/MemberSignup';
import MemberBookings from './pages/MemberBookings';
// Add page imports here

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/" element={<BookSimulator />} />
      <Route path="/BookSimulator" element={<BookSimulator />} />
      <Route path="/MyReservations" element={<MyReservations />} />
      <Route path="/AdminDashboard" element={<AdminDashboard />} />
      <Route path="/AdminDashboardVadnaisHeights" element={<AdminDashboardVadnaisHeights />} />
      <Route path="/AdminDashboardBurnsville" element={<AdminDashboardBurnsville />} />
      <Route path="/PaymentSuccess" element={<PaymentSuccess />} />
      <Route path="/MemberSignup" element={<MemberSignup />} />
      <Route path="/MemberBookings" element={<MemberBookings />} />
      {/* Add your page Route elements here */}
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
