/**
 * MADINE / VYBE Platform - Central Frontend Configuration
 * =======================================================
 * This file manages the backend API connection for the entire frontend.
 * No hardcoded localhost URLs exist anywhere in the application.
 */

(function (window) {
  'use strict';

  // Live Backend Base URL
  // Kept empty ("") so client-side JavaScript never exposes the backend URL.
  // The server-side proxy (api/proxy.php on Hostinger) handles the connection securely.
  const DEFAULT_BACKEND_URL = "";

  // Check for configuration overrides:
  // 1. window.__MADINE_CONFIG__ (injected via hosting environment or head tag)
  // 2. localStorage override (useful for debugging from browser DevTools)
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

    return '';
  }

  const backendUrl = resolveBackendUrl();

  // Mode detection:
  // When hosted on Hostinger, Vercel, or Netlify, the server reverse-proxies /api requests
  // directly to the backend. This ensures the real backend URL is NEVER exposed in the
  // browser's Network or Sources tab.
  function resolveApiBaseUrl() {
    // If explicitly told to bypass proxy and use direct backend
    if (window.__MADINE_CONFIG__ && window.__MADINE_CONFIG__.USE_DIRECT === true) {
      return backendUrl ? `${backendUrl}/api` : '/api';
    }

    // When opened directly as a local file (file://), use direct backend URL
    if (window.location.protocol === 'file:') {
      return backendUrl ? `${backendUrl}/api` : '/api';
    }

    // Default to relative /api so requests route through Hostinger (.htaccess / proxy.php),
    // Vercel rewrites, or Netlify redirects with zero client-side exposure.
    return '/api';
  }

  const apiBaseUrl = resolveApiBaseUrl();

  const CONFIG = {
    // Backend Base URL
    BACKEND_URL: backendUrl,

    // API endpoint base URL (relative /api by default for privacy, or direct if configured)
    API_BASE_URL: apiBaseUrl,

    // Socket.io connection URL (uses same origin or backend host)
    SOCKET_URL: backendUrl || window.location.origin,

    // Formats any media / cafe / avatar URL
    formatImageUrl: function (path) {
      if (!path || typeof path !== 'string') return path;
      if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:') || path.startsWith('blob:')) {
        return path;
      }
      // If image exists in local static folder, return path as-is
      if (path.startsWith('/cafe-images') || path.startsWith('cafe-images')) {
        return path.startsWith('/') ? path : `/${path}`;
      }
      if (!backendUrl) return path;
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      return `${backendUrl}${cleanPath}`;
    },

    // Helper to dynamically switch API URL at runtime from console if needed
    setBackendUrl: function (newUrl) {
      if (!newUrl) {
        localStorage.removeItem('MADINE_BACKEND_URL');
      } else {
        localStorage.setItem('MADINE_BACKEND_URL', newUrl.replace(/\/+$/, ''));
      }
      window.location.reload();
    }
  };

  // Expose configuration
  window.CONFIG = CONFIG;
  window.APP_CONFIG = CONFIG;

  // Note: Console logging of the backend URL has been intentionally removed
  // to prevent leaking the backend server URL in browser DevTools.
})(window);
