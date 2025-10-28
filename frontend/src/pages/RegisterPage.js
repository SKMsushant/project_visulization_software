import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

// --- Password Strength Checker Logic ---
const checkPasswordStrength = (password) => {
    let strength = 0;
    const feedback = [];

    // Rule 1-5: Matches backend validation
    if (password.length >= 8) { strength += 1; } else { feedback.push("Minimum 8 characters"); }
    if (/[A-Z]/.test(password)) { strength += 1; } else { feedback.push("At least one uppercase letter (A-Z)"); }
    if (/[a-z]/.test(password)) { strength += 1; } else { feedback.push("At least one lowercase letter (a-z)"); }
    if (/[0-9]/.test(password)) { strength += 1; } else { feedback.push("At least one digit (0-9)"); }
    if (/[!@#$%^&*()_\-+=]/.test(password)) { strength += 1; } else { feedback.push("At least one special character (!@#$%^&*()_-+=)"); }
    return { strength, feedback, isStrong: strength === 5 };
};

// --- OTP Verification Component (Step 2) ---
const OTPForm = ({ initialData, message, setMessage, navigate, generatedOtp }) => {
    const [otp, setOtp] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    const handleVerify = async (e) => {
        e.preventDefault();
        setMessage('');
        setIsLoading(true);

        if (otp !== generatedOtp) {
             setMessage('OTP Error: Invalid OTP code.');
             setIsLoading(false);
             return;
        }

        try {
            // CRITICAL: Call the final save API. 
            // We ensure ALL original data + OTP is sent.
            await axios.post('http://127.0.0.1:8000/api/user/register/', {
                ...initialData,
                otp: otp 
            });
            
            setMessage('Account successfully verified and created! Redirecting to login...');
            
            setTimeout(() => {
                navigate('/login');
            }, 2000);

        } catch (error) {
            setMessage(`OTP Error: ${error.response?.data?.detail || 'Final registration failed.'}`);
            console.error('Final Registration Error', error);
            setIsLoading(false);
        }
    };

    const inputStyle = {
        width: '100%',
        padding: '10px',
        fontSize: '16px',
        boxSizing: 'border-box',
        border: '1px solid #ccc',
        borderRadius: '4px',
    };

    const buttonStyle = {
        padding: '10px',
        fontSize: '16px',
        backgroundColor: '#007bff',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: isLoading ? 'not-allowed' : 'pointer',
    };

    return (
        <div style={{ maxWidth: '400px', margin: '50px auto', padding: '30px', border: '1px solid #eee', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
            <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>Verify Mobile Number</h2>
            <p style={{ textAlign: 'center', color: '#555' }}>A verification code has been generated. The username for verification is **{initialData.username}**.</p>
            
            <form onSubmit={handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
                <div>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Enter OTP (6 digits):</label>
                    <input 
                        type="text" 
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        required
                        maxLength="6"
                        disabled={isLoading}
                        style={inputStyle}
                    />
                </div>
                <button type="submit" disabled={isLoading} style={buttonStyle}>
                    {isLoading ? 'Verifying...' : 'Verify Code'}
                </button>
            </form>
            {message && <p style={{ color: message.startsWith('OTP Error') ? 'red' : 'green', marginTop: '15px', textAlign: 'center' }}>{message}</p>}
        </div>
    );
};


// --- Main Registration Form Component (Step 1) ---
const RegisterPage = () => {
  const [formData, setFormData] = useState({
  username: '',
  email: '',
  password: '',
  confirm_password: '', 
  first_name: '',
  last_name: '',
  mobile_number: '',
  floor: '',
  building: '',
  street: '',
  area: '',
  landmark: '',
  pin: '',
  state: '',
  country: '',
  otp: '',
});


  const [message, setMessage] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState({ strength: 0, feedback: [], isStrong: false });
  const [generatedOtp, setGeneratedOtp] = useState('');
  const navigate = useNavigate();


  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevData) => {
      const newData = { ...prevData, [name]: value };
      // Check strength only when 'password' changes
      if (name === 'password') { 
          setPasswordStrength(checkPasswordStrength(value)); 
      }
      return newData;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setIsLoading(true);
    
    const passwordsMatch = formData.password === formData.confirm_password;

    // --- NEW: Frontend validation for password match ---
    if (!passwordsMatch) {
        setMessage(`Error: Passwords do not match.`);
        setIsLoading(false);
        return; 
    }

    if (!passwordStrength.isStrong) {
      setMessage(`Error: Password does not meet security requirements. Missing: ${passwordStrength.feedback.join(', ')}.`);
      setIsLoading(false);
      return; 
    }

    // --- CRITICAL: Remove the confirm_password field from payload sent to backend ---
    const { confirm_password, ...payloadData } = formData;
    
    // Clean the payload before sending
    const payload = {};
    for (const key in payloadData) {
      // Check if the value exists and is not an empty string
      if (payloadData[key] && payloadData[key].toString().trim() !== '') {
        payload[key] = payloadData[key];
      }
    }
    
    // Note: The backend CheckRegistrationView now handles the security checks 
    // for uniqueness and PII in password.

    try {
      // Step 1: CHECK Registration Data (Validates uniqueness, PII in password, strength, and returns the OTP)
      const response = await axios.post('http://127.0.0.1:8000/api/user/check-registration/', payload);
      
      setGeneratedOtp(response.data.otp); 
      setIsRegistered(true); 
      setMessage('Registration data valid! Please enter the OTP to finalize your account.');

    } catch (error) {
      if (error.response && error.response.data) {
        // We need to parse the object response and extract the first message
        const errorMsg = Object.values(error.response.data).map(val => Array.isArray(val) ? val.join(' ') : val).join(' ');
        setMessage(`Error: ${errorMsg}`);
      } else {
        setMessage('An error occurred. Please try again.');
      }
      console.error('Registration error', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const getPasswordColor = (strength) => {
    if (strength === 0) return '#ccc';
    if (strength <= 2) return 'red';
    if (strength <= 4) return 'orange';
    return 'green';
  };


  if (isRegistered) {
      return (
          <OTPForm 
            initialData={formData} 
            message={message}
            setMessage={setMessage} 
            navigate={navigate} 
            generatedOtp={generatedOtp}
          />
      );
  }
  
  const passwordsMatch = formData.password === formData.confirm_password;
  
  const inputStyle = {
      width: '100%',
      padding: '8px',
      boxSizing: 'border-box',
      border: '1px solid #ccc',
      borderRadius: '4px',
  };
  
  const headerStyle = {
      gridColumn: '1 / 3',
      borderBottom: '1px solid #eee',
      paddingBottom: '5px',
      marginBottom: '10px',
      marginTop: '15px'
  };

  // Main Registration Form UI
  return (
    <div style={{ 
        maxWidth: '700px', 
        margin: '30px auto', 
        padding: '30px', 
        textAlign: 'left', 
        border: '1px solid #eee', 
        borderRadius: '8px', 
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        backgroundColor: 'white'
    }}>
      <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>Complete Registration</h2>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        
        {/* Account Details */}
        <div style={headerStyle}>
          <h3>Account Details</h3>
        </div>
        
        {/* Row 1: Username & Password */}
        <div>
          <label style={{display: 'block', marginBottom: '5px'}}>Username:</label>
          <input type="text" name="username" value={formData.username} onChange={handleChange} required disabled={isLoading} style={inputStyle} />
        </div>
        <div>
          <label style={{display: 'block', marginBottom: '5px'}}>Password (Required Strength):</label>
          <input type="password" name="password" value={formData.password} onChange={handleChange} required disabled={isLoading} style={inputStyle} />
          
          {/* Password Strength Indicator */}
          <div style={{ height: '5px', backgroundColor: '#eee', marginTop: '5px' }}>
            <div 
              style={{ 
                width: `${(passwordStrength.strength / 5) * 100}%`, 
                height: '100%', 
                backgroundColor: getPasswordColor(passwordStrength.strength),
                transition: 'width 0.3s'
              }}
            ></div>
          </div>
          
          {/* Strength Feedback */}
          {formData.password && (
            <p style={{ fontSize: '0.8em', color: passwordStrength.isStrong ? 'green' : 'red', marginTop: '5px' }}>
              {passwordStrength.isStrong ? 'Password Strength: Excellent' : `Missing: ${passwordStrength.feedback.join(', ')}`}
            </p>
          )}
        </div>
        
        {/* Row 2: Email & Confirm Password */}
        <div>
          <label style={{display: 'block', marginBottom: '5px'}}>Email:</label>
          <input type="email" name="email" value={formData.email} onChange={handleChange} required disabled={isLoading} style={inputStyle} />
        </div>
        <div>
          <label style={{display: 'block', marginBottom: '5px'}}>Confirm Password:</label>
          <input type="password" name="confirm_password" value={formData.confirm_password} onChange={handleChange} required disabled={isLoading} style={inputStyle} />
          {formData.password && formData.confirm_password && !passwordsMatch && (
              <p style={{ fontSize: '0.8em', color: 'red', marginTop: '5px' }}>Passwords do not match.</p>
          )}
        </div>
        
        {/* Row 3: First/Last Name (Split into two inputs in one grid cell) */}
        <div style={{ gridColumn: '1 / 2' }}>
            <label style={{display: 'block', marginBottom: '5px'}}>First & Last Name:</label>
            <div style={{ display: 'flex', gap: '10px' }}>
                <input
                    type="text"
                    name="first_name"
                    placeholder="First Name"
                    value={formData.first_name}
                    onChange={handleChange}
                    required
                    disabled={isLoading}
                    style={{...inputStyle, width: '50%'}}
                />
                <input
                    type="text"
                    name="last_name"
                    placeholder="Last Name"
                    value={formData.last_name}
                    onChange={handleChange}
                    required
                    disabled={isLoading}
                    style={{...inputStyle, width: '50%'}}
                />
            </div>
        </div>

        {/* Row 4: Mobile Number (Full width) */}
        <div style={{ gridColumn: '1 / 3' }}>
          <label style={{display: 'block', marginBottom: '5px'}}>Mobile Number:</label>
          <input type="text" name="mobile_number" value={formData.mobile_number} onChange={handleChange} required disabled={isLoading} style={inputStyle} />
        </div>

        {/* Address Details */}
        <div style={headerStyle}>
          <h3>Address Details</h3>
        </div>
        
        {/* Row 5: Building & Street */}
        <div>
          <label style={{display: 'block', marginBottom: '5px'}}>Building/House No.:</label>
          <input type="text" name="building" value={formData.building} onChange={handleChange} required disabled={isLoading} style={inputStyle} />
        </div>
        <div>
          <label style={{display: 'block', marginBottom: '5px'}}>Street:</label>
          <input type="text" name="street" value={formData.street} onChange={handleChange} required disabled={isLoading} style={inputStyle} />
        </div>
        
        {/* Row 6: Floor & Area */}
        <div>
          <label style={{display: 'block', marginBottom: '5px'}}>Floor:</label>
          <input type="text" name="floor" value={formData.floor} onChange={handleChange} disabled={isLoading} style={inputStyle} />
        </div>
        <div>
          <label style={{display: 'block', marginBottom: '5px'}}>Area:</label>
          <input type="text" name="area" value={formData.area} onChange={handleChange} required disabled={isLoading} style={inputStyle} />
        </div>
        
        {/* Row 7: Landmark & PIN */}
        <div>
          <label style={{display: 'block', marginBottom: '5px'}}>Landmark:</label>
          <input type="text" name="landmark" value={formData.landmark} onChange={handleChange} disabled={isLoading} style={inputStyle} />
        </div>
        <div>
          <label style={{display: 'block', marginBottom: '5px'}}>PIN Code:</label>
          <input type="text" name="pin" value={formData.pin} onChange={handleChange} required disabled={isLoading} style={inputStyle} />
        </div>
        
        {/* Row 8: State & Country */}
        <div>
          <label style={{display: 'block', marginBottom: '5px'}}>State:</label>
          <input type="text" name="state" value={formData.state} onChange={handleChange} required disabled={isLoading} style={inputStyle} />
        </div>
        <div>
          <label style={{display: 'block', marginBottom: '5px'}}>Country:</label>
          <input type="text" name="country" value={formData.country} onChange={handleChange} required disabled={isLoading} style={inputStyle} />
        </div>
        
        {/* Submit Button */}
        <div style={{ gridColumn: '1 / 3', textAlign: 'center', marginTop: '20px' }}>
          <button 
            type="submit" 
            disabled={
                isLoading || 
                !passwordStrength.isStrong || 
                !passwordsMatch || 
                !formData.password
            }
            style={{
                padding: '10px 20px',
                fontSize: '16px',
                backgroundColor: (isLoading || !passwordStrength.isStrong || !passwordsMatch || !formData.password) ? '#ccc' : '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: (isLoading || !passwordStrength.isStrong || !passwordsMatch || !formData.password) ? 'not-allowed' : 'pointer'
            }}
          >
            {isLoading ? 'Checking...' : 'Check Data and Send OTP'}
          </button>
        </div>
      </form>
      {message && <p style={{ gridColumn: '1 / 3', textAlign: 'center', color: message.startsWith('Error') ? 'red' : 'green', marginTop: '20px' }}>{message}</p>}
    </div>
  );
};

export default RegisterPage;