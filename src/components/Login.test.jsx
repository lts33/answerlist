
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import Login from './Login';
import axios from 'axios';

// Mock axios
vi.mock('axios');

// Mock GoogleLogin
vi.mock('@react-oauth/google', async () => {
    const actual = await vi.importActual('@react-oauth/google');
    return {
        ...actual,
        GoogleLogin: ({ onSuccess, onError }) => (
            <button onClick={() => onSuccess({ credential: 'fake_token' })}>
                Google Login
            </button>
        ),
    };
});

describe('Login Component', () => {
    const setUser = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it('handles direct token response successfully', async () => {
        // Backend returning token directly without status wrapper
        axios.post.mockResolvedValue({
            status: 200,
            data: {
                access_token: 'valid_token',
                username: 'Test User'
            }
        });

        render(<Login setUser={setUser} />);

        const loginButton = screen.getAllByText('Google Login')[0];
        fireEvent.click(loginButton);

        await waitFor(() => {
            expect(setUser).toHaveBeenCalledWith({
                name: 'Test User',
                token: 'valid_token'
            });
        });
    });

    it('handles 202 Accepted with valid payload successfully', async () => {
        // Backend returning 202 with token
        axios.post.mockResolvedValue({
            status: 202,
            data: {
                access_token: 'valid_token_202',
                username: 'Test User 202'
            }
        });

        render(<Login setUser={setUser} />);

        const loginButton = screen.getAllByText('Google Login')[0];
        fireEvent.click(loginButton);

        await waitFor(() => {
            expect(setUser).toHaveBeenCalledWith({
                name: 'Test User 202',
                token: 'valid_token_202'
            });
        });
    });

    it('handles 401 Unauthorized', async () => {
        axios.post.mockRejectedValue({
            response: { status: 401 }
        });

        render(<Login setUser={setUser} />);

        const loginButton = screen.getAllByText('Google Login')[0];
        fireEvent.click(loginButton);

        await waitFor(() => {
            expect(screen.getByText('Authentication failed: Invalid credentials.')).toBeDefined();
        });
    });
});
