/**
 * API utility functions for making HTTP requests
 */

const DEFAULT_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
};

interface ApiOptions extends RequestInit {
  headers?: Record<string, string>;
}

export async function get(url: string, options: ApiOptions = {}) {
  const response = await fetch(url, {
    ...options,
    method: "GET",
    headers: { ...DEFAULT_HEADERS, ...options.headers },
  });
  return handleResponse(response);
}

export async function post(url: string, data: unknown, options: ApiOptions = {}) {
  const response = await fetch(url, {
    ...options,
    method: "POST",
    headers: { ...DEFAULT_HEADERS, ...options.headers },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
}

export async function put(url: string, data: unknown, options: ApiOptions = {}) {
  const response = await fetch(url, {
    ...options,
    method: "PUT",
    headers: { ...DEFAULT_HEADERS, ...options.headers },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
}

export async function del(url: string, options: ApiOptions = {}) {
  const response = await fetch(url, {
    ...options,
    method: "DELETE",
    headers: { ...DEFAULT_HEADERS, ...options.headers },
  });
  return handleResponse(response);
}

async function handleResponse(response: Response) {
  const data = await response.json();

  if (!response.ok) {
    const error: any = new Error(data.error || "An error occurred");
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

const api = { get, post, put, del };
export default api;
