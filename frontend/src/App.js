import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import DataPrepPage from './pages/DataPrepPage';
import './App.css';

// Import all of our real page components
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import WelcomePage from './pages/WelcomePage';
import AccountPage from './pages/AccountPage';

// Import dashboard pages
import ReportDashboardPage from './pages/ReportDashboardPage'; // NEW IMPORT

// Import our ProtectedRoute component
import ProtectedRoute from './components/ProtectedRoute';
import DBConnectionPage from './pages/DBConnectionPage';
import SQLQueryPage from './pages/SQLQueryPage';
// --- NEW ---
import PublicReportView from './pages/PublicReportView'; // Import the new page
// --- END NEW ---


// Import AuthProvider
import { AuthProvider, useAuth } from './AuthContext';

// A helper component to handle navigation for logout
function LogoutLink() {
    const navigate = useNavigate();
    const { logout } = useAuth();

    const handleLogout = () => {
        logout(); // Use AuthContext logout
        navigate('/login');
    };

    return (
        <button
            onClick={handleLogout}
            style={{
                background: 'none',
                border: 'none',
                color: 'blue',
                textDecoration: 'underline',
                cursor: 'pointer',
                marginLeft: '1rem'
            }}
        >
            Logout
        </button>
    );
}

// --- SMART HOME LINK ---
function SmartHomeLink({ children, style }) {
    const { isAuthenticated } = useAuth();
    const targetPath = isAuthenticated ? '/dashboard' : '/';

    return (
        <Link to={targetPath} style={style}>
            {children}
        </Link>
    );
}
// -----------------------

function AppContent() {
    const { isAuthenticated } = useAuth();

    return (
        <div className="App">
            <nav style={{ padding: '1rem', backgroundColor: '#eee' }}>

                <SmartHomeLink style={{ marginRight: '1rem' }}>Home</SmartHomeLink>

                {/* CONDITIONAL LINKS (Login/Register) */}
                {!isAuthenticated && (
                    <>
                        <Link to="/login" style={{ marginRight: '1rem' }}>Login</Link>
                        <Link to="/register" style={{ marginRight: '1rem' }}>Register</Link>
                    </>
                )}

                {/* ACCOUNT LINK (Appears only when authenticated) */}
                {isAuthenticated && (
                    <Link to="/account" style={{ marginRight: '1rem' }}>Account</Link>
                )}

                {/* Dashboard and Logout Links */}
                {isAuthenticated && (
                    <>
                        <Link to="/dashboard" style={{ marginLeft: '1rem' }}>Dashboard</Link>
                        <LogoutLink />
                    </>
                )}
            </nav>

            <Routes>
                {/* --- Public Routes --- */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/" element={<WelcomePage />} />
                {/* --- NEW: Public Share Route --- */}
                <Route path="/shared/:token" element={<PublicReportView />} />
                {/* --- END NEW --- */}


                {/* --- Protected Routes --- */}
                <Route
                    path="/db/connections"
                    element={
                        <ProtectedRoute>
                            <DBConnectionPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/db/query/:connectionId"
                    element={
                        <ProtectedRoute>
                            <SQLQueryPage />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/account"
                    element={
                        <ProtectedRoute>
                            <AccountPage />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/dashboard"
                    element={
                        <ProtectedRoute>
                            <DashboardPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/prep/:projectId"
                    element={
                        <ProtectedRoute>
                            <DataPrepPage />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/reporting/:projectId"
                    element={
                        <ProtectedRoute>
                            <ReportDashboardPage />
                        </ProtectedRoute>
                    }
                />

            </Routes>
        </div>
    );
}

function App() {
    return (
        <Router>
            <AuthProvider>
                <AppContent />
            </AuthProvider>
        </Router>
    );
}

export default App;