import React from "react";
import { act, render, renderHook } from "@testing-library/react";
import { useBackToTop } from "../../../src/app/components/character/useBackToTop";

describe("useBackToTop", () => {
  afterEach(() => {
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });

  it("is hidden at the top and shown after scrolling past 360px", () => {
    const { result } = renderHook(() => useBackToTop());
    expect(result.current.showBackToTop).toBe(false);
    act(() => {
      Object.defineProperty(window, "scrollY", { value: 500, configurable: true });
      window.dispatchEvent(new Event("scroll"));
    });
    expect(result.current.showBackToTop).toBe(true);
    act(() => {
      Object.defineProperty(window, "scrollY", { value: 100, configurable: true });
      window.dispatchEvent(new Event("scroll"));
    });
    expect(result.current.showBackToTop).toBe(false);
  });

  it("scrolls the marker into view, smoothly unless reduced motion is requested", () => {
    const scrollIntoView = jest.fn();
    function Harness() {
      const { topMarkerRef, scrollToTop } = useBackToTop();
      return (
        <>
          <div ref={topMarkerRef} />
          <button onClick={scrollToTop}>top</button>
        </>
      );
    }
    const { getByText, container } = render(<Harness />);
    (container.firstChild as HTMLElement).scrollIntoView = scrollIntoView;

    window.matchMedia = jest.fn().mockReturnValue({ matches: false }) as never;
    getByText("top").click();
    expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: "smooth", block: "start" });

    window.matchMedia = jest.fn().mockReturnValue({ matches: true }) as never;
    getByText("top").click();
    expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: "auto", block: "start" });
  });

  it("falls back to scrolling the document when there is no marker", () => {
    const scrollTo = jest.fn();
    Object.defineProperty(document, "scrollingElement", {
      value: { scrollTop: 0, scrollTo },
      configurable: true,
    });
    window.matchMedia = jest.fn().mockReturnValue({ matches: false }) as never;
    const { result } = renderHook(() => useBackToTop());
    act(() => result.current.scrollToTop());
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    Object.defineProperty(document, "scrollingElement", {
      value: document.documentElement,
      configurable: true,
    });
  });
});
