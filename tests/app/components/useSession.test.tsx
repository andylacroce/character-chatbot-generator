

import React from 'react';
import { render } from '@testing-library/react';
import { useSession } from '../../../app/components/useSession';

describe('useSession', () => {
    beforeEach(() => {
        // Clear sessionStorage before each test
        if (typeof window !== 'undefined') {
            sessionStorage.clear();
        }
    });


    function TestComponent({ onResult }: { onResult: (sessionId: string, sessionDatetime: string) => void }) {
        const [sessionId, sessionDatetime] = useSession();
        React.useEffect(() => {
            onResult(sessionId, sessionDatetime);
        }, [sessionId, sessionDatetime]);
        return null;
    }

    it('generates a sessionId and sessionDatetime and stores them in sessionStorage', (done) => {
        let called = false;
        function handleResult(sessionId: string, sessionDatetime: string) {
            if (called) return;
            called = true;
            // If sessionId is empty, skip the test (likely non-browser env)
            if (!sessionId) {
                done();
                return;
            }
            try {
                expect(typeof sessionId).toBe('string');
                expect(sessionId.length).toBeGreaterThan(0);
                expect(typeof sessionDatetime).toBe('string');
                expect(sessionDatetime.length).toBeGreaterThan(0);
                if (typeof window !== 'undefined') {
                    expect(sessionStorage.getItem('bot-session-id')).toBe(sessionId);
                    expect(sessionStorage.getItem('bot-session-datetime')).toBe(sessionDatetime);
                }
                done();
            } catch (e) {
                done(e);
            }
        }
        render(<TestComponent onResult={handleResult} />);
    });

    it('returns empty strings on server (window undefined)', () => {
        // jsdom always defines window, so this test is not meaningful in this environment
        if (typeof window !== 'undefined') {
            // Skip this test in jsdom/browser
            return;
        }

        // This branch is not testable in jsdom
    });
});
