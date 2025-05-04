import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Provider } from 'react-redux';
import { ApolloProvider } from '@apollo/client';

// Import store and client
import store from './store';
import client from './apollo/client';

// Import layouts
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';

// Import pages
import HomePage from './pages/HomePage';
import ModelMarketplace from './pages/ModelMarketplace';
import ModelDetails from './pages/ModelDetails';
import Dashboard from './pages/Dashboard';
import MyModels from './pages/MyModels';
import MyLicenses from './pages/MyLicenses';
import ModelForm from './pages/ModelForm';
import LicenseForm from './pages/LicenseForm';
import PaymentHistory from './pages/PaymentHistory';
import Profile from './pages/Profile';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import NotFound from './pages/NotFound';

// Import components
import PrivateRoute from './components/PrivateRoute';
import AdminRoute from './components/AdminRoute';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminModels from './pages/admin/AdminModels';
import AdminLicenses from './pages/admin/AdminLicenses';
import AdminPayments from './pages/admin/AdminPayments';

// Create theme
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#3f51b5',
    },
    secondary: {
      main: '#f50057',
    },
    background: {
      default: '#f5f5f5',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontSize: '2.5rem',
      fontWeight: 500,
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 500,
    },
    h3: {
      fontSize: '1.75rem',
      fontWeight: 500,
    },
    h4: {
      fontSize: '1.5rem',
      fontWeight: 500,
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 500,
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 500,
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 4px 12px 0 rgba(0,0,0,0.05)',
        },
      },
    },
  },
});

function App() {
  return (
    <Provider store={store}>
      <ApolloProvider client={client}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <Router>
            <Routes>
              {/* Auth routes */}
              <Route element={<AuthLayout />}>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password/:token" element={<ResetPassword />} />
              </Route>

              {/* Main layout routes */}
              <Route element={<MainLayout />}>
                {/* Public routes */}
                <Route path="/" element={<HomePage />} />
                <Route path="/marketplace" element={<ModelMarketplace />} />
                <Route path="/models/:id" element={<ModelDetails />} />

                {/* Private routes */}
                <Route element={<PrivateRoute />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/my-models" element={<MyModels />} />
                  <Route path="/my-licenses" element={<MyLicenses />} />
                  <Route path="/models/create" element={<ModelForm />} />
                  <Route path="/models/edit/:id" element={<ModelForm />} />
                  <Route path="/licenses/create/:modelId" element={<LicenseForm />} />
                  <Route path="/licenses/edit/:id" element={<LicenseForm />} />
                  <Route path="/payments" element={<PaymentHistory />} />
                  <Route path="/profile" element={<Profile />} />
                </Route>

                {/* Admin routes */}
                <Route element={<AdminRoute />}>
                  <Route path="/admin" element={<AdminDashboard />} />
                  <Route path="/admin/users" element={<AdminUsers />} />
                  <Route path="/admin/models" element={<AdminModels />} />
                  <Route path="/admin/licenses" element={<AdminLicenses />} />
                  <Route path="/admin/payments" element={<AdminPayments />} />
                </Route>

                {/* Not found */}
                <Route path="/404" element={<NotFound />} />
                <Route path="*" element={<Navigate to="/404" replace />} />
              </Route>
            </Routes>
          </Router>
        </ThemeProvider>
      </ApolloProvider>
    </Provider>
  );
}

export default App;
