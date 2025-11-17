
import React, { useState } from 'react';
import SuccessAnimation from './SuccessAnimation';

const AccessPage = ({ onAccessGranted }: { onAccessGranted: () => void }) => {
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState('');
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const response = await fetch('/api/verify-access-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accessCode }),
      });

      if (response.ok) {
        setShowSuccessAnimation(true);
        setTimeout(() => {
          onAccessGranted();
        }, 1000);
      } else {
        const data = await response.json();
        setError(data.message || 'Invalid access code');
      }
    } catch (error) {
      setError('An error occurred. Please try again.');
    }
  };

  if (showSuccessAnimation) {
    return <SuccessAnimation />;
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <form onSubmit={handleSubmit}>
        <h1>Enter Access Code</h1>
        <input
          type="password"
          value={accessCode}
          onChange={(e) => setAccessCode(e.target.value)}
          style={{ padding: '10px', fontSize: '16px' }}
        />
        <button type="submit" style={{ padding: '10px', fontSize: '16px', marginLeft: '10px' }}>
          Enter
        </button>
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </form>
    </div>
  );
};

export default AccessPage;
