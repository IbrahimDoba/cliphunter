import { getSession } from 'next-auth/react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Cache for backend token
let cachedToken: string | null = null;
let tokenExpiry: number = 0;

async function getBackendToken(): Promise<string | null> {
  // Check if we have a valid cached token
  if (cachedToken && Date.now() < tokenExpiry) {
    console.log('[API] Using cached token');
    return cachedToken;
  }

  // Check if user is authenticated
  const session = await getSession();
  if (!session?.user) {
    console.log('[API] No session found');
    return null;
  }

  console.log('[API] Fetching new backend token for user:', session.user.id);

  try {
    // Fetch new token from API route
    const response = await fetch('/api/token');
    if (!response.ok) {
      console.error('[API] Token fetch failed:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();
    if (!data.token) {
      console.error('[API] No token in response:', data);
      return null;
    }

    cachedToken = data.token;
    // Cache for 6 days (token expires in 7 days)
    tokenExpiry = Date.now() + (6 * 24 * 60 * 60 * 1000);
    console.log('[API] Successfully got backend token');
    return cachedToken;
  } catch (error) {
    console.error('[API] Failed to get backend token:', error);
    return null;
  }
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getBackendToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    console.log('[API] Request to', endpoint, 'with Authorization header');
  } else {
    console.warn('[API] No token available for request to', endpoint);
  }

  const response = await fetch(`${BACKEND_URL}/api${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(
      error.error?.message || 'API request failed',
      response.status,
      error.error?.code
    );
  }

  // Handle empty responses
  const text = await response.text();
  if (!text) return {} as T;

  return JSON.parse(text);
}

// Server-side API client (for use in Server Components)
export async function serverApiClient<T>(
  endpoint: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...options.headers,
  };

  const response = await fetch(`${BACKEND_URL}/api${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(
      error.error?.message || 'API request failed',
      response.status,
      error.error?.code
    );
  }

  const text = await response.text();
  if (!text) return {} as T;

  return JSON.parse(text);
}
