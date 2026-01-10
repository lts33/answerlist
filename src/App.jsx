import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { googleLogout, GoogleLogin } from '@react-oauth/google';

const API_BASE = 'https://app.lt3.live';

function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Check for existing token
    const token = localStorage.getItem('access_token');
    const storedUser = localStorage.getItem('user_data');
    if (token && storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error("Failed to parse user data from local storage", e);
        localStorage.removeItem('access_token');
        localStorage.removeItem('user_data');
      }
    }
  }, []);

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

function Login({ setUser }) {
    const [error, setError] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);
    const [displayName, setDisplayName] = useState('');
    const [googleToken, setGoogleToken] = useState(null);

    const handleGoogleSuccess = async (credentialResponse) => {
        setIsLoggingIn(true);
        setError('');

        try {
            // Step 3: Frontend sends POST /auth/google with body: { "token": "..." } (No name yet).
            const payload = {
                token: credentialResponse.credential
            };

            const res = await axios.post(`${API_BASE}/auth/google`, payload);

            // Handle the API Response
            if (res.data.status === 'register_required') {
                // Case B: Registration Required (Status 202)
                setGoogleToken(credentialResponse.credential);
                setIsRegistering(true);
                setIsLoggingIn(false);
            } else if (res.data.status === 'login_success') {
                // Case A: Success (Status 200)
                handleLoginSuccess(res.data);
            } else {
                setError('Unexpected response from server.');
                setIsLoggingIn(false);
            }

        } catch (err) {
            console.error(err);
            if (err.response && err.response.status === 202) {
                 // In case axios is configured to throw on 202 or if the server returns it in a way that axios catches?
                 // Standard axios does not throw on 202. But checking just in case user meant 202 is treated differently.
                 // Actually, if the backend sends 202, axios resolves.
                 // However, I'll trust my logic above.
                 // If the backend returns error status (4xx, 5xx), it lands here.
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
            // Step 3 (Registration): Frontend sends POST /auth/google again with: { "token": "...", "name": "User Typed Name" }
            const payload = {
                token: googleToken,
                name: displayName
            };

            const res = await axios.post(`${API_BASE}/auth/google`, payload);

            if (res.data.status === 'login_success') {
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
        localStorage.setItem('access_token', data.access_token);
        // Construct a user object to store
        // Backend returns: { "status": "login_success", "access_token": "...", "username": "Stored Name" }
        const userData = {
            name: data.username,
            // id: data.user_id, // prompt didn't mention user_id in new response, but keeping consistent with usage might be needed.
            // If the dashboard doesn't need ID, it's fine. Dashboard uses user.name and user.token.
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
        <div className="flex items-center justify-center min-h-screen p-4">
            <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full text-center">
                <h1 className="text-3xl font-bold text-indigo-600 mb-6">
                    {isRegistering ? 'Almost There!' : 'Welcome'}
                </h1>

                {isRegistering ? (
                    // Registration Form
                    <>
                        <p className="mb-4 text-gray-600">Please choose a Display Name to finish signup.</p>
                        <div className="mb-6 text-left">
                            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="display-name">
                                Display Name
                            </label>
                            <input
                                id="display-name"
                                type="text"
                                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                placeholder="Enter your name"
                                value={displayName}
                                onChange={(e) => {
                                    setDisplayName(e.target.value);
                                    if(error) setError('');
                                }}
                            />
                        </div>
                        <button
                            onClick={handleRegisterSubmit}
                            disabled={isLoggingIn}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline w-full transition"
                        >
                            {isLoggingIn ? 'Submitting...' : 'Submit'}
                        </button>
                    </>
                ) : (
                    // Google Login
                    <div className="flex justify-center">
                         <GoogleLogin
                            onSuccess={handleGoogleSuccess}
                            onError={handleError}
                            useOneTap
                        />
                    </div>
                )}

                {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
                {!isRegistering && isLoggingIn && <p className="mt-4 text-indigo-600">Logging in...</p>}
            </div>
        </div>
    );
}

function Dashboard({ user, logout }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loadingSearch, setLoadingSearch] = useState(false);

    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState('');
    const [adding, setAdding] = useState(false);
    const [addMessage, setAddMessage] = useState('');

    const handleSearch = async (e) => {
        if (e.key === 'Enter') {
            if (!query.trim()) return;
            setLoadingSearch(true);
            try {
                const res = await axios.get(`${API_BASE}/search?q=${encodeURIComponent(query)}`, {
                    headers: { Authorization: `Bearer ${user.token}` }
                });
                setResults(res.data);
            } catch (err) {
                console.error(err);
                alert('Search failed');
            } finally {
                setLoadingSearch(false);
            }
        }
    };

    const handleAdd = async (e) => {
        e.preventDefault();
        setAdding(true);
        setAddMessage('');
        try {
            await axios.post(`${API_BASE}/add`, {
                question,
                answer
            }, {
                headers: { Authorization: `Bearer ${user.token}` }
            });
            setAddMessage('Item added successfully!');
            setQuestion('');
            setAnswer('');
            // Clear message after 3 seconds
            setTimeout(() => setAddMessage(''), 3000);
        } catch (err) {
            console.error(err);
            setAddMessage('Failed to add item.');
        } finally {
            setAdding(false);
        }
    };

    return (
        <div className="container mx-auto px-4 py-8 max-w-5xl">
            <header className="flex justify-between items-center mb-10 border-b pb-4">
                <div>
                    <h1 className="text-2xl font-bold text-indigo-700">Dashboard</h1>
                    <p className="text-gray-600">Welcome, <span className="font-semibold">{user.name}</span></p>
                </div>
                <button
                    onClick={logout}
                    className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded transition"
                >
                    Logout
                </button>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Search */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-lg shadow p-6">
                        <h2 className="text-xl font-semibold mb-4 text-gray-800">Search</h2>
                        <input
                            type="text"
                            className="w-full text-lg p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition"
                            placeholder="Type and hit Enter to search..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={handleSearch}
                        />
                         {loadingSearch && <div className="mt-4 text-center text-gray-500">Searching...</div>}
                    </div>

                    <div className="space-y-4">
                        {results.map((item, idx) => (
                            <div key={item.id || idx} className="bg-white rounded-lg shadow p-6 border-l-4 border-indigo-500">
                                <h3 className="text-lg font-bold text-gray-800 mb-2">{item.question}</h3>
                                <p className="text-gray-600 whitespace-pre-wrap">{item.metadata?.answer || 'No answer'}</p>
                            </div>
                        ))}
                        {results.length === 0 && !loadingSearch && query && (
                             <p className="text-center text-gray-500 mt-4">No results found or waiting for search.</p>
                        )}
                    </div>
                </div>

                {/* Right Column: Add New */}
                <div className="lg:col-span-1">
                    <div className="bg-white rounded-lg shadow p-6 sticky top-6">
                        <h2 className="text-xl font-semibold mb-4 text-gray-800">Add New Item</h2>
                        <form onSubmit={handleAdd} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Question</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full p-2 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                    value={question}
                                    onChange={(e) => setQuestion(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Answer</label>
                                <textarea
                                    required
                                    rows="4"
                                    className="w-full p-2 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                    value={answer}
                                    onChange={(e) => setAnswer(e.target.value)}
                                ></textarea>
                            </div>
                            <button
                                type="submit"
                                disabled={adding}
                                className={`w-full py-2 px-4 rounded text-white font-bold transition ${adding ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                            >
                                {adding ? 'Adding...' : 'Add Item'}
                            </button>
                            {addMessage && (
                                <div className={`text-center text-sm ${addMessage.includes('success') ? 'text-green-600' : 'text-red-600'}`}>
                                    {addMessage}
                                </div>
                            )}
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default App;