// Short-lived in-memory state between slash command invocations and modal submissions
export const pendingCreations = new Map();

// Short-lived search context so the back button can rebuild results
export const pendingSearches = new Map();
