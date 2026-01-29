// @vitest-environment jsdom
import { render, screen, waitFor, act } from '@testing-library/react';
import Dashboard from './Dashboard';
import React from 'react';
import { expect, test, vi, describe, beforeEach } from 'vitest';
import axios from 'axios';

// Mock axios
vi.mock('axios');

// Mock IntersectionObserver
const observe = vi.fn();
const unobserve = vi.fn();
const disconnect = vi.fn();

window.IntersectionObserver = vi.fn().mockImplementation(function(callback) {
    this.observe = observe;
    this.unobserve = unobserve;
    this.disconnect = disconnect;
    this.callback = callback; // expose callback to manually trigger it in tests
});

describe('Dashboard All Items', () => {
    const user = { name: 'Test User', token: 'test-token' };
    const logout = vi.fn();

    // Generate 25 dummy items
    const mockAllItems = Array.from({ length: 25 }, (_, i) => ({
        id: i + 1,
        question: `Question ${i + 1}`,
        answer: `Answer ${i + 1} with some more text to test line clamping.`
    }));

    beforeEach(() => {
        vi.clearAllMocks();
        axios.get.mockImplementation((url, config) => {
            if (url.includes('/all')) {
                const limit = config?.params?.limit || 10;
                const offset = config?.params?.offset || 0;
                return Promise.resolve({ data: mockAllItems.slice(offset, offset + limit) });
            }
            if (url.includes('/search')) {
                return Promise.resolve({ data: [] });
            }
            return Promise.resolve({ data: [] });
        });
    });

    test('fetches items, displays them, and loads more on scroll', async () => {
        render(<Dashboard user={user} logout={logout} />);

        // Wait for fetching to complete
        await waitFor(() => {
            expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/all'), expect.anything());
        });

        // Check if "All Questions" header is present
        expect(await screen.findByText(/All Questions/)).toBeDefined();

        // Check if items are rendered
        let headings = await screen.findAllByRole('heading', { level: 3 });

        // Should have at least 10 items (visibleItems)
        const question1 = headings.find(h => h.textContent.includes('Question 1'));
        expect(question1).toBeDefined();

        const question10 = headings.find(h => h.textContent.includes('Question 10'));
        expect(question10).toBeDefined();

        // Question 11 should NOT be present in the headings (since limit is 10)
        const question11 = headings.find(h => h.textContent.includes('Question 11'));
        expect(question11).toBeUndefined();

        // --- Simulate Infinite Scroll ---

        // Simulate intersection
        const observerCalls = window.IntersectionObserver.mock.calls;
        // Find the correct observer instance/callback.
        const callback = observerCalls[observerCalls.length - 1][0];

        // Trigger the callback with isIntersecting: true
        // In the component, we check for entries[0].isIntersecting && hasMore && !loadingItems
        await act(async () => {
            callback([{ isIntersecting: true }]);
        });

        // Should render next 10 items
        await waitFor(async () => {
            headings = await screen.findAllByRole('heading', { level: 3 });
            const q11 = headings.find(h => h.textContent.includes('Question 11'));
            expect(q11).toBeDefined();
        });

        headings = await screen.findAllByRole('heading', { level: 3 });
        expect(headings.find(h => h.textContent.includes('Question 20'))).toBeDefined();

        // Question 21 should not be present yet (total 20 loaded)
        expect(headings.find(h => h.textContent.includes('Question 21'))).toBeUndefined();
    });
});
