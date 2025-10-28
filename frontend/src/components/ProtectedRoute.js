import React from 'react';
import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ children }) => {
  // Check if the user has an access token in localStorage
  const isAuthenticated = localStorage.getItem('accessToken');

  if (!isAuthenticated) {
    // If not authenticated, redirect to the login page
    return <Navigate to="/login" />;
  }

  // If authenticated, render the child component (e.g., the DashboardPage)
  return children;
};

export default ProtectedRoute;