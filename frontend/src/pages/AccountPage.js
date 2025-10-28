// --- src/pages/AccountPage.js ---

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const AccountPage = () => {
    const [userData, setUserData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    // Helper to get Auth Header (copied from DashboardPage for local utility)
    const getAuthHeader = useCallback(() => {
        const token = localStorage.getItem('accessToken');
        if (!token) {
            navigate('/login');
            return null;
        }
        return {
            headers: { 'Authorization': `Bearer ${token}` }
        };
    }, [navigate]);

    const fetchUserDetails = useCallback(async () => {
        const authHeader = getAuthHeader();
        if (!authHeader) return;

        try {
            // NOTE: We need a backend API endpoint (e.g., /api/user/details/) 
            // that returns User and Profile info without the password hash.
            // Assuming the Dashboard endpoint or a similar authorized endpoint works for now.
            // For a complete solution, you must ensure your Django backend provides this secure endpoint.
            const response = await axios.get('http://127.0.0.1:8000/api/user/details/', authHeader);
            setUserData(response.data);
        } catch (err) {
            console.error("Error fetching account details:", err);
            setError(err.response?.data?.detail || "Failed to load account details. (API missing or unauthorized)");
        } finally {
            setIsLoading(false);
        }
    }, [getAuthHeader]);

    useEffect(() => {
        fetchUserDetails();
    }, [fetchUserDetails]);

    if (isLoading) return <div style={{padding: '50px', textAlign: 'center'}}>Loading account data...</div>;
    if (error) return <div style={{padding: '50px', textAlign: 'center', color: 'red'}}>{error}</div>;
    if (!userData) return <div style={{padding: '50px', textAlign: 'center'}}>No user data found.</div>;

    const user = userData.user || {};
    const profile = userData.profile || {};
    const address = {
        floor: profile.floor || 'N/A',
        building: profile.building || 'N/A',
        street: profile.street || 'N/A',
        area: profile.area || 'N/A',
        landmark: profile.landmark || 'N/A',
        pin: profile.pin || 'N/A',
        state: profile.state || 'N/A',
        country: profile.country || 'N/A',
    };

    return (
        <div style={{ maxWidth: '800px', margin: '30px auto', padding: '30px', background: 'white', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
            <h2 style={{borderBottom: '2px solid #007bff', paddingBottom: '10px'}}>My Account Details</h2>

            <h3 style={{ marginTop: '30px' }}>User Information</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', border: '1px solid #eee', padding: '15px', borderRadius: '4px' }}>
                <p><strong>Username:</strong> {user.username}</p>
                <p><strong>Email:</strong> {user.email}</p>
                <p><strong>Full Name:</strong> {user.first_name} {user.last_name}</p>
                <p><strong>Mobile:</strong> {profile.mobile_number || 'N/A'}</p>
            </div>

            <h3 style={{ marginTop: '30px' }}>Address Details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', border: '1px solid #eee', padding: '15px', borderRadius: '4px' }}>
                <p><strong>Building/House No:</strong> {address.building}</p>
                <p><strong>Street:</strong> {address.street}</p>
                <p><strong>Floor:</strong> {address.floor}</p>
                <p><strong>Area:</strong> {address.area}</p>
                <p><strong>Landmark:</strong> {address.landmark}</p>
                <p><strong>PIN Code:</strong> {address.pin}</p>
                <p><strong>State:</strong> {address.state}</p>
                <p><strong>Country:</strong> {address.country}</p>
            </div>
        </div>
    );
};

export default AccountPage;