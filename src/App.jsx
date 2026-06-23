import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/SupabaseAuthContext';
import Login from './pages/Login';
import Signup from './pages/Signup';
import BookSimulator from './pages/BookSimulator';
import MyReservations from './pages/MyReservations';
import AdminDashboard from './pages/AdminDashboard';
import AdminDashboardVadnaisHeights from './pages/AdminDashboardVadnaisHeights';
import AdminDashboardBurnsville from './pages/AdminDashboardBurnsville';
import PaymentSuccess from './pages/PaymentSuccess';
import MemberSignup from './pages/MemberSignup';
import MemberBookings from './pages/MemberBookings';
// Add page imports here

const Spinner = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

// Gate admin pages on the auth context (which loads the session reliably) so an
// admin is never denied during the brief window before their role resolves.
const AdminRoute = ({ children }) => {
  const { isLoadingAuth, profileLoaded, isAdmin } = useAuth();
  if (isLoadingAuth || !profileLoaded) return <Spinner />;
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="max-w-md text-center bg-white rounded-xl shadow p-8">
          <h2 className="text-2xl font-bold text-red-600 mb-2">Access Denied</h2>
          <p className="text-slate-600">Admin privileges required to access this page.</p>
        </div>
      </div>
    );
  }
  return children;
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isAuthenticated } = useAuth();

  // Wait until the Supabase session has been resolved.
  if (isLoadingAuth) return <Spinner />;

  // Unauthenticated: only expose the auth pages; send everything else to login.
  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/Login" element={<Login />} />
        <Route path="/Signup" element={<Signup />} />
        <Route path="*" element={<Navigate to="/Login" replace />} />
      </Routes>
    );
  }

  // Authenticated: full app. Visiting the auth pages bounces to home.
  return (
    <Routes>
      <Route path="/" element={<BookSimulator />} />
      <Route path="/BookSimulator" element={<BookSimulator />} />
      <Route path="/MyReservations" element={<MyReservations />} />
      <Route path="/AdminDashboard" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
      <Route path="/AdminDashboardVadnaisHeights" element={<AdminRoute><AdminDashboardVadnaisHeights /></AdminRoute>} />
      <Route path="/AdminDashboardBurnsville" element={<AdminRoute><AdminDashboardBurnsville /></AdminRoute>} />
      <Route path="/PaymentSuccess" element={<PaymentSuccess />} />
      <Route path="/MemberSignup" element={<MemberSignup />} />
      <Route path="/MemberBookings" element={<MemberBookings />} />
      <Route path="/Login" element={<Navigate to="/" replace />} />
      <Route path="/Signup" element={<Navigate to="/" replace />} />
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
