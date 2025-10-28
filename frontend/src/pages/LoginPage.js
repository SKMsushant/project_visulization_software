import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

// --- Password Strength Checker Logic (for use in reset form) ---
const checkPasswordStrength = (password) => {
    let strength = 0;
    const feedback = [];
    if (password.length >= 8) { strength += 1; } else { feedback.push("Minimum 8 characters"); }
    if (/[A-Z]/.test(password)) { strength += 1; } else { feedback.push("At least one uppercase letter (A-Z)"); }
    if (/[a-z]/.test(password)) { strength += 1; } else { feedback.push("At least one lowercase letter (a-z)"); }
    if (/[0-9]/.test(password)) { strength += 1; } else { feedback.push("At least one digit (0-9)"); }
    if (/[!@#$%^&*()_\-+=]/.test(password)) { strength += 1; } else { feedback.push("At least one special character (!@#$%^&*()_-+=)"); }
    return { strength, feedback, isStrong: strength === 5 };
};

// --- OTP Verification Component for 2FA Login ---
const LoginOTPForm = ({ identifier, password, navigate }) => {
  const [otp, setOtp] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setMessage('');
    setIsLoading(true);

    try {
      const response = await axios.post('http://127.0.0.1:8000/api/token/verify-challenge/', {
        identifier: identifier,
        otp: otp
      });

      const { access, refresh } = response.data;
      localStorage.setItem('accessToken', access);
      localStorage.setItem('refreshToken', refresh);
      setMessage('Login successful! Redirecting to dashboard...');
      setTimeout(() => navigate('/dashboard'), 1500);

    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'OTP verification failed.';
      setMessage(`Error: ${errorMsg}`);
      setIsLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '0 auto', padding: '20px' }}>
      <h2>Two-Factor Authentication</h2>
      <p>A verification code has been sent to your registered email and mobile number.</p>
      <p style={{ color: '#666', fontSize: '0.9em', marginTop: '10px' }}><strong>Check your mail inbox .</strong></p>
      <form onSubmit={handleVerifyOTP} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
        <div>
          <label>Enter OTP (6 digits):</label>
          <input type="text" value={otp} onChange={(e) => setOtp(e.target.value)} required maxLength="6" disabled={isLoading} style={{ width: '100%', padding: '10px', fontSize: '16px' }} placeholder="Enter 6-digit code" />
        </div>
        <button type="submit" disabled={isLoading} style={{ padding: '10px', cursor: isLoading ? 'not-allowed' : 'pointer' }}>
          {isLoading ? 'Verifying...' : 'Verify OTP'}
        </button>
      </form>
      {message && <p style={{ color: message.startsWith('Error') ? 'red' : 'green', marginTop: '10px' }}>{message}</p>}
    </div>
  );
};

// --- Final Password Reset Form (with API connection) ---
const ResetPasswordFinalForm = ({ identifier, setIsForgotPassword }) => {
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [message, setMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isError, setIsError] = useState(false);
    const [passwordStrength, setPasswordStrength] = useState({ strength: 0, feedback: [], isStrong: false });

    const handlePasswordChange = (e) => {
        setNewPassword(e.target.value);
        setPasswordStrength(checkPasswordStrength(e.target.value));
    };
    
    const getPasswordColor = (strength) => {
        if (strength === 0) return '#ccc';
        if (strength <= 2) return 'red';
        if (strength <= 4) return 'orange';
        return 'green';
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage('');
        setIsError(false);
        setIsLoading(true);

        if (newPassword !== confirmPassword) {
            setMessage("Passwords do not match.");
            setIsError(true);
            setIsLoading(false);
            return;
        }

        if (!passwordStrength.isStrong) {
            setMessage(`Password is not strong enough. Missing: ${passwordStrength.feedback.join(', ')}`);
            setIsError(true);
            setIsLoading(false);
            return;
        }

        try {
            const response = await axios.post('http://127.0.0.1:8000/api/user/password-reset-confirm/', {
                identifier: identifier,
                otp: otp,
                new_password: newPassword
            });
            
            setMessage(response.data.message + " Redirecting to login...");
            setIsError(false);
            
            setTimeout(() => {
                setIsForgotPassword(false); 
            }, 2000);

        } catch (error) {
            let errorMsg = "An unknown error occurred.";
            if (error.response && error.response.data) {
                if (Array.isArray(error.response.data.detail)) {
                    errorMsg = error.response.data.detail.join(' ');
                } else {
                    errorMsg = error.response.data.detail || errorMsg;
                }
            }
            setMessage(`Error: ${errorMsg}`);
            setIsError(true);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: '400px', margin: '0 auto', padding: '20px' }}>
            <h2>Set New Password</h2>
            <p>Please enter the OTP sent to your email and your new password.</p>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
                <div>
                    <label>Email or Username:</label>
                    <input type="text" value={identifier} disabled style={{ width: '100%', padding: '8px', background: '#eee' }} />
                </div>
                <div>
                    <label>OTP from Email:</label>
                    <input type="text" value={otp} onChange={(e) => setOtp(e.target.value)} required disabled={isLoading} style={{ width: '100%', padding: '8px' }} />
                </div>
                <div>
                    <label>New Password:</label>
                    <input type="password" value={newPassword} onChange={handlePasswordChange} required disabled={isLoading} style={{ width: '100%', padding: '8px' }} />
                    <div style={{ height: '5px', backgroundColor: '#eee', marginTop: '5px' }}>
                        <div style={{ width: `${(passwordStrength.strength / 5) * 100}%`, height: '100%', backgroundColor: getPasswordColor(passwordStrength.strength), transition: 'width 0.3s' }}></div>
                    </div>
                    {newPassword && !passwordStrength.isStrong && (
                        <p style={{ fontSize: '0.8em', color: 'red', margin: '5px 0 0 0' }}>{`Missing: ${passwordStrength.feedback.join(', ')}`}</p>
                    )}
                </div>
                <div>
                    <label>Confirm New Password:</label>
                    <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required disabled={isLoading} style={{ width: '100%', padding: '8px' }} />
                    {newPassword && confirmPassword && newPassword !== confirmPassword && (
                        <p style={{ fontSize: '0.8em', color: 'red', margin: '5px 0 0 0' }}>Passwords do not match.</p>
                    )}
                </div>
                <button type="submit" disabled={isLoading || !passwordStrength.isStrong || newPassword !== confirmPassword} style={{ padding: '10px' }}>
                    {isLoading ? 'Resetting...' : 'Set New Password'}
                </button>
            </form>
            {message && <p style={{ color: isError ? 'red' : 'green', marginTop: '10px' }}>{message}</p>}
        </div>
    );
};

// --- Forgot Password Form Component ---
const ForgotPasswordForm = ({ setIsForgotPassword }) => {
    const [identifier, setIdentifier] = useState('');
    const [message, setMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isError, setIsError] = useState(false);
    const [otpSent, setOtpSent] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setMessage('');
        setIsError(false);
        
        try {
            const response = await axios.post('http://127.0.0.1:8000/api/user/password-reset-request/', {
                identifier: identifier
            });
            setMessage(response.data.message);
            setOtpSent(true);
        } catch (error) {
            setIsError(true);
            setMessage(error.response?.data?.detail || "An error occurred. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    if (otpSent) {
        return <ResetPasswordFinalForm identifier={identifier} setIsForgotPassword={setIsForgotPassword} />;
    }

    return (
        <div style={{ maxWidth: '400px', margin: '0 auto', padding: '20px' }}>
            <h2>Reset Password</h2>
            <p>Enter your email address or username and we'll send you an OTP to reset your password.</p>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
                <div>
                    <label>Email or Username:</label>
                    <input type="text" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required disabled={isLoading} style={{ width: '100%', padding: '8px' }} placeholder="your.email@example.com or username" />
                </div>
                <button type="submit" disabled={isLoading} style={{ padding: '10px' }}>
                    {isLoading ? 'Sending...' : 'Send Reset OTP'}
                </button>
            </form>
            {message && <p style={{ color: isError ? 'red' : 'green', marginTop: '10px' }}>{message}</p>}
            <div style={{ textAlign: 'center', marginTop: '15px' }}>
                <button onClick={() => setIsForgotPassword(false)} style={{ background: 'none', border: 'none', color: '#007bff', textDecoration: 'underline', cursor: 'pointer' }}>
                    Back to Login
                </button>
            </div>
        </div>
    );
};

// --- Main Login Component ---
const LoginPage = () => {
  const [formData, setFormData] = useState({ identifier: '', password: '' });
  const [message, setMessage] = useState('');
  const [showOTPForm, setShowOTPForm] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      const response = await axios.post('http://127.0.0.1:8000/api/token/', {
        identifier: formData.identifier,
        password: formData.password,
      });
      const { access, refresh } = response.data;
      localStorage.setItem('accessToken', access);
      localStorage.setItem('refreshToken', refresh);
      setMessage('Login successful! Redirecting to dashboard...');
      setTimeout(() => navigate('/dashboard'), 1500);
    } catch (error) {
      if (error.response) {
        const { data, status } = error.response;
        // The backend now sends specific error messages in data.detail
        let detail = data.detail || data.error || data.message || '';
        
        // This handles the new, specific messages from the backend's CustomTokenObtainPairView
        if (typeof detail === 'object') {
            detail = data.detail.detail || JSON.stringify(data.detail);
        }


        const detailLower = String(detail).toLowerCase();
        const isOTPRequired = status === 202 || data.otp_required === true || detailLower.includes('otp sent');

        if (isOTPRequired) {
          setMessage('OTP sent! Check your email');
          setShowOTPForm(true);
        } else {
          // Display the specific error message from the backend
          setMessage(`Error: ${detail}`);
        }
      } else {
        setMessage('An error occurred. Please try again.');
      }
      console.error('Login error', error);
    }
  };

  if (showOTPForm) return <LoginOTPForm identifier={formData.identifier} password={formData.password} navigate={navigate} />;
  if (isForgotPassword) return <ForgotPasswordForm setIsForgotPassword={setIsForgotPassword} />;

  return (
    <div style={{ maxWidth: '400px', margin: '0 auto', padding: '20px' }}>
      <h2>Login</h2>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div>
          <label>Login ID (Username, Email, or Mobile):</label>
          <input type="text" name="identifier" value={formData.identifier} onChange={handleChange} required style={{ width: '100%', padding: '8px' }} />
        </div>
        <div>
          <label>Password:</label>
          <input type="password" name="password" value={formData.password} onChange={handleChange} required style={{ width: '100%', padding: '8px' }} />
        </div>
        <button type="submit" style={{ padding: '10px' }}>Login</button>
      </form>
      <div style={{ textAlign: 'center', marginTop: '15px' }}>
        <button onClick={() => setIsForgotPassword(true)} style={{ background: 'none', border: 'none', color: '#007bff', textDecoration: 'underline', cursor: 'pointer' }}>
          Forgot Password?
        </button>
      </div>
      {message && <p style={{ color: message.startsWith('Error') ? 'red' : 'green', marginTop: '10px' }}>{message}</p>}
    </div>
  );
};

export default LoginPage;