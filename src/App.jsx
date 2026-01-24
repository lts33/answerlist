import React, { useState } from 'react';
import { googleLogout } from '@react-oauth/google';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

function App() {
  const [user, setUser] = useState(() => {
    // Check for existing token
    const token = localStorage.getItem('access_token');
    const storedUser = localStorage.getItem('user_data');
    if (token && storedUser) {
      try {
        return JSON.parse(storedUser);
      } catch (e) {
        console.error("Failed to parse user data from local storage", e);
        localStorage.removeItem('access_token');
        localStorage.removeItem('user_data');
      }
    }
    return null;
  });

  const handleLogout = () => {
    googleLogout();
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_data');
    setUser(null);
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-gray-900">
      {user ? (
        <Dashboard user={user} logout={handleLogout} />
      ) : (
        <Login setUser={setUser} />
      )}
    </div>
  );
}

export default App;
