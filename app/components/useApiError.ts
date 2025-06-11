import { useState, useCallback } from "react";

/**
 * Custom hook to handle API error state and user-friendly messages.
 * Returns error, setError, and a handler for API errors.
 */
export function useApiError() {
  const [error, setError] = useState<string>("");

  // Handles different error types and sets a user-friendly message
  const handleApiError = useCallback((err: unknown) => {
    if (!err) {
      setError("");
      return;
    }
    const genericErrorMsg = "Error sending message. Please try again.";
    // Handle HTTP error objects
    if (typeof err === "object" && err !== null && "response" in err) {
      const response = (err as { response?: unknown }).response;
      // Always prefer custom error message from response if present (first, before any status checks)
      if (response && typeof (response as { data?: unknown }).data === "object" && (response as { data: unknown }).data !== null) {
        const errorData = (response as { data: unknown }).data as Record<string, unknown>;
        if (
          typeof errorData.error === "string"
        ) {
          setError(errorData.error);
          return;
        }
      }
      if (response && typeof (response as { status?: unknown }).status === "number") {
        if ((response as { status: number }).status === 429) {
          setError("You are sending messages too quickly. Please wait and try again.");
          return;
        }
        if ((response as { status: number }).status === 408) {
          setError("The server took too long to respond. Please try again.");
          return;
        }
        if ((response as { status: number }).status >= 500) {
          setError(genericErrorMsg);
          return;
        }
      }
    }
    // Handle string errors (always generic)
    if (typeof err === "string") {
      setError(genericErrorMsg);
      return;
    }
    // Handle error objects with a message
    if (typeof err === "object" && err !== null && "message" in err && typeof (err as { message?: string }).message === "string") {
      setError(genericErrorMsg);
      return;
    }
    setError(genericErrorMsg);
  }, []);

  return { error, setError, handleApiError };
}
