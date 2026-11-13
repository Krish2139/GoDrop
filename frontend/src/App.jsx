import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import PassengerPortal from './pages/PassengerPortal';
import DriverPortal from './pages/DriverPortal';
import AdminPortal from './pages/AdminPortal';
import SystemArchitecture from './pages/SystemArchitecture';
import AuthPage from './pages/AuthPage';
import NotFound from './pages/NotFound';
import './styles/global.css';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <Navbar />
          <main style={{ flex: 1 }}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/auth" element={<AuthPage />} />
              
              {/* Role-Based Protected Routes */}
              <Route 
                path="/passenger" 
                element={
                  <ProtectedRoute allowedRoles={['PASSENGER', 'ADMIN']}>
                    <PassengerPortal />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/driver" 
                element={
                  <ProtectedRoute allowedRoles={['DRIVER', 'ADMIN']}>
                    <DriverPortal />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/admin" 
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <AdminPortal />
                  </ProtectedRoute>
                } 
              />

              <Route path="/architecture" element={<SystemArchitecture />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
