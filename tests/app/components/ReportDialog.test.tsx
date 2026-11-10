import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ReportDialog from "../../../src/app/components/common/ReportDialog";

const mockFetch = jest.fn();
jest.mock("../../../src/utils/api", () => ({
  authenticatedFetch: (...args: unknown[]) => mockFetch(...args),
}));

const target = { targetType: "message", characterName: "Ada", messageText: "hello" } as const;

describe("ReportDialog", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders nothing when hidden", () => {
    render(<ReportDialog show={false} onClose={jest.fn()} target={target} />);
    expect(screen.queryByText("Report a problem")).not.toBeInTheDocument();
  });

  it("requires a reason, then posts the report and confirms", async () => {
    mockFetch.mockResolvedValue({ ok: true });
    render(<ReportDialog show onClose={jest.fn()} target={target} />);
    const send = screen.getByRole("button", { name: "Send report" });
    expect(send).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Offensive or inappropriate"));
    fireEvent.change(screen.getByLabelText(/Anything else/), { target: { value: "rude" } });
    fireEvent.click(send);
    await screen.findByText("Thanks, we'll take a look.");
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/report");
    expect(JSON.parse(init.body)).toEqual({ ...target, reason: "offensive", details: "rude" });
  });

  it("shows an error and allows a retry when the request fails", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 });
    render(<ReportDialog show onClose={jest.fn()} target={target} />);
    fireEvent.click(screen.getByLabelText("Something else"));
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Send report" })).toBeEnabled();
  });
});
