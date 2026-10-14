/**
 * MADINE / VYBE Platform - Central Frontend Configuration
 * =======================================================
 * This file manages the backend API connection for the entire frontend.
 * No hardcoded backend URLs should exist anywhere else in the application.
 *
 * HOW TO CONFIGURE FOR PRODUCTION:
 * - When hosting frontend separately (e.g., Vercel, Netlify, Cloudflare Pages):
 *   Change `DEFAULT_BACKEND_URL` below to your live backend server URL:
 *   e.g. const DEFAULT_BACKEND_URL = "https://your-madine-backend.onrender.com";
 *
 * - When hosting frontend and backend together on the same domain:
 *   Leave `DEFAULT_BACKEND_URL` as empty string "" to use relative /api.
 */

(function (window) {
  'use strict';

  // ---> SET YOUR LIVE BACKEND URL HERE FOR SEPARATE HOSTING <---
  // Leave empty ("") for same-domain deployment or local relative proxy
  const DEFAULT_BACKEND_URL = "";

  // Check for overrides:
  // 1. window.__MADINE_CONFIG__ (can be injected via HTML or hosting environment)
  // 2. localStorage override (useful for debugging from browser DevTools)
  // 3. Auto-detection for local standalone static server (e.g. live-server / vite / serve on port 3000, 5173, etc.)
  function resolveBackendUrl() {
    if (window.__MADINE_CONFIG__ && window.__MADINE_CONFIG__.BACKEND_URL) {
      return window.__MADINE_CONFIG__.BACKEND_URL.replace(/\/+$/, '');
    }

    const saved = localStorage.getItem('MADINE_BACKEND_URL');
    if (saved) {
      return saved.replace(/\/+$/, '');
    }

    if (DEFAULT_BACKEND_URL && DEFAULT_BACKEND_URL.trim()) {
      return DEFAULT_BACKEND_URL.trim().replace(/\/+$/, '');
    }

    // Auto-detection for local development:
    // If the frontend is opened on a different port than backend (4000), default backend to http://localhost:4000
    const isLocalFrontend = (
      window.location.protocol === 'file:' ||
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
      window.location.port !== '4000' &&
      window.location.port !== ''
    );

    if (isLocalFrontend) {
      return 'http://localhost:4000';
    }

    // Default to empty string (same-origin / relative path)
    return '';
  }

  const backendUrl = resolveBackendUrl();

  const CONFIG = {
    // Base host URL of the backend (e.g. "https://api.yourdomain.com" or "http://localhost:4000" or "")
    BACKEND_URL: backendUrl,

    // API endpoint base URL (e.g. "https://api.yourdomain.com/api" or "/api")
    API_BASE_URL: backendUrl ? `${backendUrl}/api` : '/api',

    // Socket.io connection URL (e.g. "https://api.yourdomain.com" or window.location.origin)
    SOCKET_URL: backendUrl || window.location.origin,

    // Formats any media / cafe / avatar URL to route through the backend if needed
    formatImageUrl: function (path) {
      if (!path || typeof path !== 'string') return path;
      if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:') || path.startsWith('blob:')) {
        return path;
      }
      if (!backendUrl) return path;
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      return `${backendUrl}${cleanPath}`;
    },

    // Helper to dynamically switch API URL at runtime from console
    setBackendUrl: function (newUrl) {
      if (!newUrl) {
        localStorage.removeItem('MADINE_BACKEND_URL');
      } else {
        localStorage.setItem('MADINE_BACKEND_URL', newUrl.replace(/\/+$/, ''));
      }
      window.location.reload();
    }
  };

  // Expose globally to the whole frontend
  window.CONFIG = CONFIG;
  window.APP_CONFIG = CONFIG; // alias

  console.log('[MADINE Config] API Base URL:', CONFIG.API_BASE_URL, '| Backend:', CONFIG.BACKEND_URL || '(same-origin)');
})(window);
