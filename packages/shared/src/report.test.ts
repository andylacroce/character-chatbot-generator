/** @jest-environment jsdom */
import { renderHook, act } from "@testing-library/react";
import { isReportReason, useReportForm } from "./report";

describe("isReportReason", () => {
  it("accepts known reasons only", () => {
    expect(isReportReason("offensive")).toBe(true);
    expect(isReportReason("spam")).toBe(false);
  });
});

describe("useReportForm", () => {
  const target = { targetType: "character", characterName: "Ada" } as const;

  it("does nothing until a reason is chosen", async () => {
    const submit = jest.fn().mockResolvedValue({});
    const { result } = renderHook(() => useReportForm(submit));
    await act(() => result.current.send(target));
    expect(submit).not.toHaveBeenCalled();
  });

  it("submits the trimmed details and ends in sent", async () => {
    const submit = jest.fn().mockResolvedValue({});
    const { result } = renderHook(() => useReportForm(submit));
    act(() => {
      result.current.setReason("other");
      result.current.setDetails("  hi  ");
    });
    await act(() => result.current.send(target));
    expect(submit).toHaveBeenCalledWith({ ...target, reason: "other", details: "hi" });
    expect(result.current.status).toBe("sent");
  });

  it("reports failure and resets", async () => {
    const submit = jest.fn().mockRejectedValue(new Error("x"));
    const { result } = renderHook(() => useReportForm(submit));
    act(() => result.current.setReason("offensive"));
    await act(() => result.current.send(target));
    expect(result.current.status).toBe("error");
    act(() => result.current.reset());
    expect(result.current.reason).toBeNull();
    expect(result.current.status).toBe("idle");
  });
});
