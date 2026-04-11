import React from 'react';
import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const token = sessionStorage.getItem('token');
  const userRole = sessionStorage.getItem('userRole');

  const isAuthenticated = token === 'authenticated';

  // 🐛 DEBUG PRINTS: Open your browser console (F12) to see these!
  console.log("🛡️ SECURITY GUARD CHECK 🛡️");
  console.log("- Is Logged In?", isAuthenticated);
  console.log("- Current Role:", userRole);
  console.log("- Allowed Roles Here:", allowedRoles);

  if (!isAuthenticated) {
    console.log("❌ Access Denied: Not logged in. Sending to Login Page.");
    return <Navigate to="/" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(userRole)) {
      console.log(`❌ Access Denied: ${userRole} is not allowed here. Redirecting...`);
      if (userRole === 'SUPER_ADMIN') return <Navigate to="/admin" replace />;
      if (userRole === 'MANAGER') return <Navigate to="/manager" replace />;
      return <Navigate to="/coordinator" replace />; 
  }

  console.log("✅ Access Granted: Welcome!");
  return children;
};

export default ProtectedRoute;