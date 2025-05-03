export interface ParsedKubeError {
  statusCode: number;
  reason: string;
  message: string;
}

/**
 * Parses errors from the @kubernetes/client-node, especially those resembling HttpError,
 * to extract meaningful status code, reason, and message.
 * @param error The error object caught (type unknown).
 * @param contextNamespace Optional namespace for logging context.
 * @returns A ParsedKubeError object.
 */
export function parseKubernetesError(
  error: unknown,
  contextNamespace?: string
): ParsedKubeError {
  let k8sApiMessage = "Kubernetes API error occurred";
  let k8sApiReason = "Unknown";
  let k8sStatusCode = 500; // Default status code

  const logContext = contextNamespace
    ? ` for namespace ${contextNamespace}`
    : "";
  // Log the raw error regardless of type
  console.error(`Kubernetes health check failed${logContext}:`, error);

  // Check if it looks like a Kubernetes client HttpError (duck typing)
  // Check for instanceof Error first for type safety
  if (
    error instanceof Error &&
    "response" in error &&
    error.response &&
    typeof error.response === "object"
  ) {
    // Now we can more safely assume it has HttpError-like properties
    const response = (error as any).response; // Use type assertion carefully

    // 1. Get HTTP status code first from the response header
    k8sStatusCode = response.statusCode || 500;

    let parsedBody: any = null;
    try {
      if (response.body) {
        if (typeof response.body === "string") {
          // Attempt to parse if it looks like JSON
          if (response.body.trim().startsWith("{")) {
            parsedBody = JSON.parse(response.body);
          } else {
            // If it's a plain string (not JSON), use it as the message
            k8sApiMessage = response.body.trim();
          }
        } else if (typeof response.body === "object") {
          parsedBody = response.body; // Already an object
        }
      }
    } catch (parseError) {
      console.error(
        `Failed to parse Kubernetes error body${logContext}:`,
        parseError
      );
      // If parsing fails, use the raw body string if available and informative
      if (typeof response.body === "string" && response.body.trim()) {
        k8sApiMessage = response.body.trim();
      } else if (error.message) {
        // error is known to be instanceof Error here
        // Fallback to the Error's message property
        k8sApiMessage = error.message;
      } else {
        k8sApiMessage = `Kubernetes API error (status code: ${k8sStatusCode}, unparseable body)`;
      }
      // Keep default reason and status code unless overwritten below
    }

    // 3. If parsing succeeded and we have an object
    if (parsedBody && typeof parsedBody === "object") {
      // Use message/reason from parsed body
      k8sApiMessage = parsedBody.message || JSON.stringify(parsedBody); // Prioritize message field
      k8sApiReason = parsedBody.reason || "Unknown"; // Prioritize reason field
      // 4. Use status code from parsed body if available (often more specific, e.g., 404)
      if (parsedBody.code && typeof parsedBody.code === "number") {
        k8sStatusCode = parsedBody.code;
      }
    } else if (
      !parsedBody &&
      k8sApiMessage === "Kubernetes API error occurred"
    ) {
      // If parsing didn't happen or failed, and message wasn't set use error.message if available
      // error is known to be instanceof Error here
      k8sApiMessage =
        error.message || `Kubernetes API error (status code: ${k8sStatusCode})`;
    }
  } else if (error instanceof Error) {
    // Handle generic errors (e.g., network issues)
    k8sApiMessage = error.message;
    // Keep default reason and status code (500) for non-HttpErrors unless more info is available
  } else {
    // Handle non-Error throws
    k8sApiMessage = String(error);
    // Keep default reason and status code (500)
  }

  return {
    statusCode: k8sStatusCode,
    reason: k8sApiReason,
    message: k8sApiMessage,
  };
}
