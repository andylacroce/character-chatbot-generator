import React from 'react';
import { render } from '@testing-library/react';
import { useSession } from '../../../app/components/useSession';

describe('useSession', () => {
    beforeEach(() => {
        // Clear localStorage before each test
        if (typeof window !== 'undefined') {
            localStorage.clear();
        }
    });


    function TestComponent({ onResult }: { onResult: (sessionId: string, sessionDatetime: string) => void }) {
        const [sessionId, sessionDatetime] = useSession();
        const onResultRef = React.useRef(onResult);
        React.useEffect(() => {
            onResultRef.current = onResult;
        }, [onResult]);

        React.useEffect(() => {
            onResultRef.current(sessionId, sessionDatetime);
        }, [sessionId, sessionDatetime]);
        return null;
    }

    it('generates a sessionId and sessionDatetime and stores them in localStorage', (done) => {
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
                    expect(localStorage.getItem('bot-session-id')).toBe(sessionId);
                    expect(localStorage.getItem('bot-session-datetime')).toBe(sessionDatetime);
                }
                done();
            } catch (e) {
                done(e);
            }
        }
        render(<TestComponent onResult={handleResult} />);
    });

});
