import React from 'react';

const ShareModal = ({ shareLink, onClose }) => {

    const handleCopyLink = () => {
        navigator.clipboard.writeText(shareLink)
            .then(() => alert('Link copied to clipboard!'))
            .catch(err => console.error('Failed to copy link: ', err));
    };

    // Basic share handlers - these open the respective apps if installed
    const subject = "Check out this Report";
    const body = `Here's a link to a report I wanted to share:\n${shareLink}`;

    const handleEmail = () => {
        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    };

    // Note: Gmail/Outlook specific links are less reliable than generic mailto:
    // const handleGmail = () => {
    //     window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    // };

    const handleWhatsApp = () => {
        window.open(`https://wa.me/?text=${encodeURIComponent(body)}`, '_blank');
    };

    const modalStyle = {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        backgroundColor: 'white',
        padding: '30px',
        borderRadius: '8px',
        boxShadow: '0 5px 15px rgba(0,0,0,0.3)',
        zIndex: 1050, // Ensure it's above other elements
        width: '450px',
        maxWidth: '90%',
    };

    const overlayStyle = {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 1040,
    };

    const buttonStyle = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '10px 15px',
        border: '1px solid #ccc',
        borderRadius: '5px',
        cursor: 'pointer',
        textAlign: 'center',
        margin: '5px',
        flex: '1 1 45%', // Allow wrapping
        minWidth: '120px',
        fontSize: '14px',
        background: '#f8f9fa'
    };

     const iconStyle = { marginRight: '8px', fontSize: '1.2em' };

    return (
        <>
            <div style={overlayStyle} onClick={onClose}></div>
            <div style={modalStyle}>
                <button onClick={onClose} style={{ position: 'absolute', top: '10px', right: '15px', background: 'none', border: 'none', fontSize: '1.5em', cursor: 'pointer' }}>&times;</button>
                <h3 style={{ marginTop: 0, textAlign: 'center', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>Share Report</h3>
                <p style={{ textAlign: 'center', color: '#666', marginBottom: '15px' }}>Share this link via:</p>

                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '20px', gap: '10px' }}>
                     {/* Generic Email */}
                    <button style={buttonStyle} onClick={handleEmail}>
                         <span style={iconStyle}>📧</span> Email
                    </button>
                    {/* WhatsApp */}
                    <button style={buttonStyle} onClick={handleWhatsApp}>
                        <span style={iconStyle}>💬</span> WhatsApp
                    </button>
                    {/* Copy Link */}
                    <button style={buttonStyle} onClick={handleCopyLink}>
                        <span style={iconStyle}>🔗</span> Copy Link
                    </button>
                    {/* Placeholder for Gmail/Outlook if needed later
                    <button style={buttonStyle} onClick={handleGmail}>Gmail</button>
                    <button style={buttonStyle} onClick={() => alert('Outlook sharing not implemented')}>Outlook</button>
                    */}
                </div>

                <div style={{ marginTop: '15px', borderTop: '1px solid #eee', paddingTop: '15px' }}>
                    <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '5px' }}>Or copy link manually:</label>
                    <input
                        type="text"
                        value={shareLink}
                        readOnly
                        style={{ width: '100%', padding: '8px', boxSizing: 'border-box', border: '1px solid #ccc', borderRadius: '4px', background: '#eee' }}
                    />
                </div>
            </div>
        </>
    );
};

export default ShareModal;