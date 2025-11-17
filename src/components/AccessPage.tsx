
import React, { useState } from 'react';
import SuccessAnimation from './SuccessAnimation';
import { HASHED_ACCESS_CODES } from '../assets/accessCodes';
import bcrypt from 'bcryptjs';

const AccessPage = ({ onAccessGranted }: { onAccessGranted: () => void }) => {
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState('');
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const isCodeValid = await Promise.all(
      HASHED_ACCESS_CODES.map((hashedCode) => bcrypt.compare(accessCode, hashedCode))
    ).then((results) => results.some((result) => result));

    if (isCodeValid) {
      setShowSuccessAnimation(true);
      setTimeout(() => {
        onAccessGranted();
      }, 1000);
    } else {
      setError('Invalid access code');
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
