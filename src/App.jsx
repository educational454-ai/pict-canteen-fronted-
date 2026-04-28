import { Routes, Route } from 'react-router-dom';
// 🚀 1. IMPORT THE TOASTER
import { Toaster } from 'react-hot-toast';
import { Analytics } from '@vercel/analytics/react'; 

import LoginPage from './pages/LoginPage';
import MenuPage from './pages/MenuPage';
import CodeRedirect from './pages/CodeRedirect';
import CoordinatorDashboard from './pages/CoordinatorDashboard';
import CanteenManagerDashboard from './pages/CanteenManagerDashboard';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import ProtectedRoute from './components/ProtectedRoute'; 
import Footer from './components/Footer';

function App() {
  return (
    <div className="flex flex-col min-h-screen">
      
      {/* 🚀 2. ADD THE TOASTER COMPONENT HERE */}
      <Toaster 
        position="top-right" 
        toastOptions={{ 
          duration: 3000,
          style: { fontWeight: '600', borderRadius: '12px', padding: '16px' }
        }} 
      />

      <div className="flex-grow">
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/menu" element={<MenuPage />} />
          <Route path="/code/:voucher" element={<CodeRedirect />} />
          
          <Route path="/coordinator" element={<ProtectedRoute allowedRoles={['COORDINATOR']}><CoordinatorDashboard /></ProtectedRoute>} />
          <Route path="/manager" element={<ProtectedRoute allowedRoles={['MANAGER']}><CanteenManagerDashboard /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute allowedRoles={['SUPER_ADMIN']}><SuperAdminDashboard /></ProtectedRoute>} />
        </Routes>
      </div>

      <Footer />
      <Analytics />
    </div>
  );
}

export default App;