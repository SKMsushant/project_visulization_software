import React from 'react';
import { Link } from 'react-router-dom';

const WelcomePage = () => {
  return (
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
      <h1>Welcome to the Data Visualization Platform</h1>
      <p>Your simple, no-code solution for creating beautiful data visualizations.</p>
      <div style={{ marginTop: '30px' }}>
        <Link to="/login" style={{ marginRight: '20px', fontSize: '1.2em' }}>
          Login
        </Link>
        <Link to="/register" style={{ fontSize: '1.2em' }}>
          Register
        </Link>
      </div>
    </div>
  );
};

export default WelcomePage;
