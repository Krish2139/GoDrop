import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Request interceptor to attach JWT auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem('godrop_token') ||
                  sessionStorage.getItem('rideflow_token') ||
                  localStorage.getItem('godrop_token') ||
                  localStorage.getItem('rideflow_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle standard API errors, deleted/suspended accounts, and 429 rate limiting
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const data = error.response?.data;

    if (status === 429) {
      console.warn('[Rate Limit Exceeded] HTTP 429 from API Gateway');
    }

    if (
      (status === 401 && (data?.error === 'AccountRemoved' || data?.accountSuspended || data?.error === 'InvalidToken')) ||
      (status === 404 && data?.accountSuspended)
    ) {
      sessionStorage.removeItem('rideflow_token');
      sessionStorage.removeItem('rideflow_user');
      sessionStorage.removeItem('godrop_token');
      sessionStorage.removeItem('godrop_user');
      localStorage.removeItem('rideflow_token');
      localStorage.removeItem('rideflow_user');
      localStorage.removeItem('godrop_token');
      localStorage.removeItem('godrop_user');
      if (data?.message) {
        sessionStorage.setItem('rideflow_auth_error', data.message);
      }
      window.dispatchEvent(new CustomEvent('rideflow:force-logout', { detail: { reason: data?.message } }));
    }

    return Promise.reject(error);
  }
);

export default apiClient;

