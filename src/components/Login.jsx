import React, { useState } from 'react';
import axios from 'axios';
import { GoogleLogin } from '@react-oauth/google';
import { User, Lock, ShieldCheck } from 'lucide-react';

const API_BASE = 'https://app.lt3.live';

export default function Login({ setUser }) {
    const [error, setError] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);
    const [displayName, setDisplayName] = useState('');
    const [googleToken, setGoogleToken] = useState(null);

    const handleGoogleSuccess = async (credentialResponse) => {
        setIsLoggingIn(true);
        setError('');

        try {
            const payload = {
                token: credentialResponse.credential
            };

            console.log('Sending Google auth request...');
            const res = await axios.post(`${API_BASE}/auth/google`, payload);
            console.log('Google auth response:', res.data);

            if (res.data && res.data.status === 'register_required') {
                setGoogleToken(credentialResponse.credential);
                setIsRegistering(true);
                setIsLoggingIn(false);
            } else if (res.data && res.data.status === 'login_success') {
                handleLoginSuccess(res.data);
            } else {
                console.warn('Unexpected response:', res);
                setError('Unexpected response from server.');
                setIsLoggingIn(false);
            }

        } catch (err) {
            console.error('Login error:', err);
            if (err.response && err.response.status === 202) {
                 setError('Authentication failed with backend.');
            } else {
                 setError('Authentication failed.');
            }
            setIsLoggingIn(false);
        }
    };

    const handleRegisterSubmit = async () => {
        if (!displayName.trim()) {
            setError('Please enter a display name.');
            return;
        }

        setIsLoggingIn(true);
        try {
            const payload = {
                token: googleToken,
                name: displayName
            };

            const res = await axios.post(`${API_BASE}/auth/google`, payload);

            if (res.data && res.data.status === 'login_success') {
                handleLoginSuccess(res.data);
            } else {
                 setError('Registration failed.');
                 setIsLoggingIn(false);
            }
        } catch (err) {
            console.error(err);
            setError('Registration failed.');
            setIsLoggingIn(false);
        }
    };

    const handleLoginSuccess = (data) => {
        let safeUsername = data.username;
        if (typeof safeUsername !== 'string') {
            console.warn('Username is not a string, using default.');
            safeUsername = 'User';
        }

        localStorage.setItem('access_token', data.access_token);
        const userData = {
            name: safeUsername,
            token: data.access_token
        };
        localStorage.setItem('user_data', JSON.stringify(userData));
        setUser(userData);
        setIsLoggingIn(false);
    };

    const handleError = () => {
        setError('Google Login Failed');
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-500 to-indigo-600 p-4">
            <div className="bg-white/95 backdrop-blur-sm p-8 rounded-2xl shadow-2xl max-w-md w-full text-center border border-white/20">
                <div className="flex justify-center mb-6">
                    <div className="p-3 bg-indigo-100 rounded-full text-indigo-600">
                        {isRegistering ? <User size={32} /> : <Lock size={32} />}
                    </div>
                </div>

                <h1 className="text-3xl font-bold text-gray-800 mb-2">
                    {isRegistering ? 'Finish Setup' : 'Welcome Back'}
                </h1>
                <p className="text-gray-500 mb-8">
                    {isRegistering
                        ? 'Create your profile to get started'
                        : 'Sign in to access your knowledge base'}
                </p>

                {isRegistering ? (
                    <div className="space-y-6">
                        <div className="text-left">
                            <label className="block text-gray-700 text-sm font-semibold mb-2" htmlFor="display-name">
                                Display Name
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <User size={18} className="text-gray-400" />
                                </div>
                                <input
                                    id="display-name"
                                    type="text"
                                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                                    placeholder="Enter your name"
                                    value={displayName}
                                    onChange={(e) => {
                                        setDisplayName(e.target.value);
                                        if(error) setError('');
                                    }}
                                />
                            </div>
                        </div>
                        <button
                            onClick={handleRegisterSubmit}
                            disabled={isLoggingIn}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-all flex items-center justify-center gap-2"
                        >
                            {isLoggingIn ? 'Creating Profile...' : (
                                <>
                                    <ShieldCheck size={18} /> Complete Registration
                                </>
                            )}
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col items-center space-y-4">
                         <div className="w-full flex justify-center py-2">
                            <GoogleLogin
                                onSuccess={handleGoogleSuccess}
                                onError={handleError}
                                useOneTap
                                theme="filled_blue"
                                shape="pill"
                                size="large"
                                width="100%"
                            />
                        </div>
                        <p className="text-xs text-gray-400">
                            Secure access powered by Google OAuth
                        </p>
                    </div>
                )}

                {error && (
                    <div className="mt-6 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 animate-pulse">
                        {error}
                    </div>
                )}

                {!isRegistering && isLoggingIn && (
                    <p className="mt-4 text-indigo-600 text-sm font-medium animate-pulse">
                        Authenticating...
                    </p>
                )}
            </div>
        </div>
    );
}
