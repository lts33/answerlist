import React, { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import { Search, Plus, LogOut, User, MessageSquare, Send } from 'lucide-react';
import { API_BASE } from '../config';

export default function Dashboard({ user, logout }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loadingSearch, setLoadingSearch] = useState(false);

    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState('');
    const [adding, setAdding] = useState(false);
    const [addMessage, setAddMessage] = useState('');

    // Items State
    const [items, setItems] = useState([]);
    const [loadingItems, setLoadingItems] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const observerRef = useRef(null);
    const ITEMS_PER_PAGE = 10;

    const handleSearch = useCallback(async (e) => {
        if (e.key === 'Enter') {
            if (!query.trim()) return;
            setLoadingSearch(true);
            try {
                const res = await axios.get(`${API_BASE}/search?q=${encodeURIComponent(query)}`, {
                    headers: { Authorization: `Bearer ${user.token}` }
                });
                setResults(Array.isArray(res.data) ? res.data : []);
            } catch (err) {
                console.error(err);
                if (err.response && err.response.status === 401) {
                    logout();
                } else {
                    alert('Search failed');
                }
            } finally {
                setLoadingSearch(false);
            }
        }
    }, [query, user.token, logout]);

    const fetchItems = useCallback(async (offset = 0) => {
        setLoadingItems(true);

        try {
            const res = await axios.get(`${API_BASE}/all`, {
                headers: { Authorization: `Bearer ${user.token}` },
                params: {
                    limit: ITEMS_PER_PAGE,
                    offset: offset
                }
            });
            const data = Array.isArray(res.data) ? res.data : [];

            if (offset === 0) {
                setItems(data);
            } else {
                setItems(prev => [...prev, ...data]);
            }

            if (data.length < ITEMS_PER_PAGE) {
                setHasMore(false);
            } else {
                setHasMore(true);
            }

        } catch (err) {
            console.error("Failed to fetch items", err);
            if (err.response && err.response.status === 401) {
                logout();
            }
        } finally {
            setLoadingItems(false);
        }
    }, [user.token, logout]);

    const handleAdd = useCallback(async (e) => {
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
            // Refresh items from beginning
            fetchItems(0);
            setTimeout(() => setAddMessage(''), 3000);
        } catch (err) {
            console.error(err);
            if (err.response && err.response.status === 401) {
                logout();
            }
            setAddMessage('Failed to add item.');
        } finally {
            setAdding(false);
        }
    }, [question, answer, user.token, fetchItems, logout]);

    useEffect(() => {
        fetchItems(0);
    }, [fetchItems]);

    // Infinite Scroll Observer
    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && hasMore && !loadingItems) {
                fetchItems(items.length);
            }
        }, { threshold: 0.1 }); // Reduced threshold for better triggering

        if (observerRef.current) {
            observer.observe(observerRef.current);
        }

        return () => observer.disconnect();
    }, [hasMore, loadingItems, items.length, fetchItems, query]);

    // Robust display name
    const displayName = typeof user.name === 'string' ? user.name : 'User';

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Navbar */}
            <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md shadow-sm border-b border-gray-100">
                <div className="container mx-auto px-4 h-16 flex justify-between items-center max-w-6xl">
                    <div className="flex items-center gap-2 text-indigo-600">
                        <MessageSquare size={24} />
                        <span className="font-bold text-xl tracking-tight">InterviewDB</span>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full">
                            <User size={16} className="text-gray-500" />
                            <span className="text-sm font-medium text-gray-700">{displayName}</span>
                        </div>
                        <button
                            onClick={logout}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                            title="Logout"
                        >
                            <LogOut size={20} />
                        </button>
                    </div>
                </div>
            </nav>

            <main className="container mx-auto px-4 py-8 max-w-6xl">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Left Column: Search & Results (8 columns) */}
                    <div className="lg:col-span-8 space-y-6">

                        {/* Search Hero */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-1">
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Search className="text-gray-400" size={20} />
                                </div>
                                <input
                                    type="text"
                                    className="w-full pl-12 pr-4 py-4 rounded-xl text-lg focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-gray-50 transition-all"
                                    placeholder="Search questions..."
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    onKeyDown={handleSearch}
                                />
                                {loadingSearch && (
                                    <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
                                        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Results or All Items */}
                        <div className="space-y-4">
                            {query ? (
                                // Search Results
                                results.length > 0 ? (
                                    results.map((item, idx) => (
                                        <div key={item.id || idx} className="group bg-white rounded-xl shadow-sm hover:shadow-md border border-gray-100 overflow-hidden transition-all duration-200">
                                            <div className="p-6">
                                                <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-start gap-2">
                                                    <span className="mt-1 w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold flex-shrink-0">Q</span>
                                                    {item.question || 'No question'}
                                                </h3>
                                                <div className="pl-8">
                                                    <p className="text-gray-600 leading-relaxed whitespace-pre-wrap">
                                                        {item.answer || 'No answer'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    !loadingSearch && (
                                        <div className="text-center py-12">
                                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                                                <Search className="text-gray-400" size={32} />
                                            </div>
                                            <h3 className="text-lg font-medium text-gray-900">No results found</h3>
                                            <p className="text-gray-500">Try adjusting your search query</p>
                                        </div>
                                    )
                                )
                            ) : (
                                // All Items View
                                <>
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                                            <MessageSquare size={20} />
                                        </div>
                                        <h2 className="text-lg font-bold text-gray-800">All Questions</h2>
                                    </div>

                                    {items.length > 0 ? (
                                        items.map((item, idx) => (
                                            <div key={item.id || idx} className="group bg-white rounded-xl shadow-sm hover:shadow-md border border-gray-100 overflow-hidden transition-all duration-200">
                                                <div className="p-6">
                                                    <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-start gap-2">
                                                        <span className="mt-1 w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold flex-shrink-0">Q</span>
                                                        {item.question || 'No question'}
                                                    </h3>
                                                    <div className="pl-8">
                                                        <p className="text-gray-600 leading-relaxed whitespace-pre-wrap line-clamp-1 group-hover:line-clamp-none transition-all duration-300">
                                                            {item.answer || 'No answer'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        loadingItems ? (
                                            <div className="text-center py-12">
                                                <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                                                <p className="text-gray-500">Loading questions...</p>
                                            </div>
                                        ) : (
                                            <div className="text-center py-12">
                                                <p className="text-gray-500">No items found.</p>
                                            </div>
                                        )
                                    )}
                                    {/* Sentinel for Infinite Scroll */}
                                    {hasMore && (
                                        <div ref={observerRef} className="h-4 w-full flex justify-center p-4">
                                             {loadingItems && items.length > 0 && (
                                                 <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                             )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Right Column: Add New (4 columns) */}
                    <div className="lg:col-span-4">
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sticky top-24">
                            <div className="flex items-center gap-2 mb-6">
                                <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                                    <Plus size={20} />
                                </div>
                                <h2 className="text-lg font-bold text-gray-800">Contribute</h2>
                            </div>

                            <form onSubmit={handleAdd} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Question</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm"
                                        placeholder="What's the question?"
                                        value={question}
                                        onChange={(e) => setQuestion(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Answer</label>
                                    <textarea
                                        required
                                        rows="6"
                                        className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm resize-none"
                                        placeholder="Type the answer here..."
                                        value={answer}
                                        onChange={(e) => setAnswer(e.target.value)}
                                    ></textarea>
                                </div>
                                <button
                                    type="submit"
                                    disabled={adding}
                                    className={`w-full py-3 px-4 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${
                                        adding
                                        ? 'bg-indigo-100 text-indigo-400 cursor-not-allowed'
                                        : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg hover:shadow-indigo-500/30'
                                    }`}
                                >
                                    {adding ? 'Adding...' : (
                                        <>
                                            <Send size={18} /> Add to Database
                                        </>
                                    )}
                                </button>
                                {addMessage && (
                                    <div className={`mt-3 p-3 rounded-lg text-sm text-center ${
                                        addMessage.includes('success')
                                        ? 'bg-green-50 text-green-600 border border-green-100'
                                        : 'bg-red-50 text-red-600 border border-red-100'
                                    }`}>
                                        {addMessage}
                                    </div>
                                )}
                            </form>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
