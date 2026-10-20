// Vite substitutes this value at build time. Keep localhost as the development default.
export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/+$/, "");
