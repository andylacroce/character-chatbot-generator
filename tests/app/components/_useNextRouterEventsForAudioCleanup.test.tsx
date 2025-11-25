import React from "react";
import { render, act } from "@testing-library/react";
import { useNextRouterEventsForAudioCleanup } from "../../../app/components/_useNextRouterEventsForAudioCleanup";

// Mock next/navigation usePathname
let mockPath = "/chat";
jest.mock("next/navigation", () => ({
    usePathname: () => mockPath,
}));

describe("useNextRouterEventsForAudioCleanup", () => {
    function Wrapper({ path, stopAudio }: { path: string; stopAudio: () => void }) {
        mockPath = path;
        useNextRouterEventsForAudioCleanup(stopAudio);
        return null;
    }

    it("calls stopAudio when pathname changes", () => {
        const stopAudio = jest.fn();
        const { rerender } = render(<Wrapper path="/chat" stopAudio={stopAudio} />);
        expect(stopAudio).not.toHaveBeenCalled();
        act(() => {
            rerender(<Wrapper path="/other" stopAudio={stopAudio} />);
        });
        expect(stopAudio).toHaveBeenCalled();
    });

    it("does not call stopAudio if pathname does not change", () => {
        const stopAudio = jest.fn();
        const { rerender } = render(<Wrapper path="/chat" stopAudio={stopAudio} />);
        rerender(<Wrapper path="/chat" stopAudio={stopAudio} />);
        expect(stopAudio).not.toHaveBeenCalled();
    });
});
