
import { useState } from 'react';
import App from '../App';
import AccessPage from './AccessPage';

const AccessProvider = () => {
  const [isAccessGranted, setIsAccessGranted] = useState(false);

  if (isAccessGranted) {
    return <App />;
  }

  return <AccessPage onAccessGranted={() => setIsAccessGranted(true)} />;
};

export default AccessProvider;
