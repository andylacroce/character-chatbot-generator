import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { STORAGE_KEYS } from "character-chatbot-shared";
import GoogleAnalyticsConsent, {
  AnalyticsPreferences,
} from "../../../src/app/components/GoogleAnalyticsConsent";

jest.mock("@next/third-parties/google", () => ({
  GoogleAnalytics: ({ gaId }: { gaId: string }) => (
    <div data-testid="google-analytics" data-measurement-id={gaId} />
  ),
}));

const MEASUREMENT_ID = "G-TEST123";

describe("GoogleAnalyticsConsent", () => {
  beforeEach(() => {
    localStorage.clear();
    delete (window as typeof window & { dataLayer?: unknown[] }).dataLayer;
    delete (window as unknown as Record<string, boolean>)[`ga-disable-${MEASUREMENT_ID}`];
  });

  it("does nothing when a valid measurement ID is not configured", async () => {
    const { container } = render(<GoogleAnalyticsConsent measurementId="not-a-ga-id" />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByLabelText("Analytics preferences")).not.toBeInTheDocument();
  });

  it("asks before loading Google Analytics and persists a decline", async () => {
    render(<GoogleAnalyticsConsent measurementId={MEASUREMENT_ID} />);

    expect(await screen.findByLabelText("Analytics preferences")).toBeInTheDocument();
    expect(screen.queryByTestId("google-analytics")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Decline" }));

    await waitFor(() =>
      expect(screen.queryByLabelText("Analytics preferences")).not.toBeInTheDocument(),
    );
    expect(localStorage.getItem(STORAGE_KEYS.googleAnalyticsConsent)).toBe("denied");
    expect(screen.queryByTestId("google-analytics")).not.toBeInTheDocument();
    expect((window as unknown as Record<string, boolean>)[`ga-disable-${MEASUREMENT_ID}`]).toBe(
      true,
    );
    const deniedCommand = (
      window as unknown as { dataLayer?: Array<ArrayLike<unknown>> }
    ).dataLayer?.at(-1);
    expect(Array.from(deniedCommand ?? [])).toEqual([
      "consent",
      "update",
      expect.objectContaining({ analytics_storage: "denied", ad_storage: "denied" }),
    ]);
  });

  it("loads Google Analytics only after opt-in", async () => {
    render(<GoogleAnalyticsConsent measurementId={`  ${MEASUREMENT_ID}  `} />);

    fireEvent.click(await screen.findByRole("button", { name: "Allow analytics" }));

    const analytics = await screen.findByTestId("google-analytics");
    expect(analytics).toHaveAttribute("data-measurement-id", MEASUREMENT_ID);
    expect(localStorage.getItem(STORAGE_KEYS.googleAnalyticsConsent)).toBe("granted");
    expect((window as unknown as Record<string, boolean>)[`ga-disable-${MEASUREMENT_ID}`]).toBe(
      false,
    );
    const grantedCommand = (
      window as unknown as { dataLayer?: Array<ArrayLike<unknown>> }
    ).dataLayer?.at(-1);
    expect(Array.from(grantedCommand ?? [])).toEqual([
      "consent",
      "update",
      expect.objectContaining({ analytics_storage: "granted", ad_storage: "denied" }),
    ]);
  });

  it("restores an existing opt-in without showing the prompt", async () => {
    localStorage.setItem(STORAGE_KEYS.googleAnalyticsConsent, "granted");
    render(<GoogleAnalyticsConsent measurementId={MEASUREMENT_ID} />);

    expect(await screen.findByTestId("google-analytics")).toBeInTheDocument();
    expect(screen.queryByLabelText("Analytics preferences")).not.toBeInTheDocument();
  });

  it("ignores unknown persisted values and asks again", async () => {
    localStorage.setItem(STORAGE_KEYS.googleAnalyticsConsent, "unknown");
    render(<GoogleAnalyticsConsent measurementId={MEASUREMENT_ID} />);

    expect(await screen.findByLabelText("Analytics preferences")).toBeInTheDocument();
  });

  it("responds to a consent change from another tab", async () => {
    localStorage.setItem(STORAGE_KEYS.googleAnalyticsConsent, "denied");
    render(<GoogleAnalyticsConsent measurementId={MEASUREMENT_ID} />);

    await waitFor(() =>
      expect((window as unknown as Record<string, boolean>)[`ga-disable-${MEASUREMENT_ID}`]).toBe(
        true,
      ),
    );

    localStorage.setItem(STORAGE_KEYS.googleAnalyticsConsent, "granted");
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: STORAGE_KEYS.googleAnalyticsConsent }),
      );
    });

    expect(await screen.findByTestId("google-analytics")).toBeInTheDocument();
  });
});

describe("AnalyticsPreferences", () => {
  beforeEach(() => localStorage.clear());

  it("shows and changes the current choice", async () => {
    render(<AnalyticsPreferences />);

    expect(
      await screen.findByText("You have not made an analytics choice yet."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Allow analytics" }));
    expect(await screen.findByText("Google Analytics is currently allowed.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Allow analytics" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Decline analytics" }));
    expect(await screen.findByText("Google Analytics is currently declined.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline analytics" })).toBeDisabled();
  });
});
