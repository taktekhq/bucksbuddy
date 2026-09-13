export default { capture: (...a: unknown[]) => console.log("[posthog]", JSON.stringify(a)), captureException: () => {}, identify: () => {}, reset: () => {} };
