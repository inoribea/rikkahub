/**
 * Server configuration storage for web deployment
 * Allows users to configure custom backend API URL when deploying frontend separately
 * 
 * Priority: UI config (localStorage) > Environment variable (VITE_API_BASE_URL) > Default "/api"
 */

const SERVER_CONFIG_STORAGE_KEY = "rikkahub:server-config";

export interface ServerConfig {
  /** Custom API base URL (e.g., "http://192.168.1.100:8080") */
  apiBaseUrl: string | null;
  /** Whether to use custom URL (for toggling) */
  useCustomUrl: boolean;
}

const DEFAULT_CONFIG: ServerConfig = {
  apiBaseUrl: null,
  useCustomUrl: false,
};

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/**
 * Get the API base URL from environment variable
 * Set via VITE_API_BASE_URL during build time
 */
function getEnvApiBaseUrl(): string | null {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (typeof envUrl === "string" && envUrl.trim()) {
    return normalizeApiUrl(envUrl.trim());
  }
  return null;
}

export function getServerConfig(): ServerConfig {
  if (!isBrowser()) return DEFAULT_CONFIG;

  const raw = window.localStorage.getItem(SERVER_CONFIG_STORAGE_KEY);
  if (!raw) return DEFAULT_CONFIG;

  try {
    const parsed = JSON.parse(raw) as Partial<ServerConfig>;
    return {
      apiBaseUrl: typeof parsed.apiBaseUrl === "string" ? parsed.apiBaseUrl : null,
      useCustomUrl: typeof parsed.useCustomUrl === "boolean" ? parsed.useCustomUrl : false,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function setServerConfig(config: Partial<ServerConfig>): void {
  if (!isBrowser()) return;

  const current = getServerConfig();
  const next: ServerConfig = {
    ...current,
    ...config,
  };

  window.localStorage.setItem(SERVER_CONFIG_STORAGE_KEY, JSON.stringify(next));
}

export function clearServerConfig(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(SERVER_CONFIG_STORAGE_KEY);
}

/**
 * Get the effective API base URL
 * Priority: UI config > Environment variable > Default "/api"
 */
export function getEffectiveApiBaseUrl(): string {
  const config = getServerConfig();
  
  // UI config takes priority
  if (config.useCustomUrl && config.apiBaseUrl) {
    return config.apiBaseUrl;
  }
  
  // Environment variable as fallback
  const envUrl = getEnvApiBaseUrl();
  if (envUrl) {
    return envUrl;
  }
  
  // Default relative path
  return "/api";
}

/**
 * Check if there's an environment variable configured
 */
export function hasEnvApiBaseUrl(): boolean {
  return getEnvApiBaseUrl() !== null;
}

/**
 * Get the environment variable API URL (for display purposes)
 */
export function getEnvApiBaseUrlForDisplay(): string | null {
  return getEnvApiBaseUrl();
}

/**
 * Validate a URL string
 * Returns true if the URL is valid and uses http/https protocol
 */
export function isValidApiUrl(url: string): boolean {
  if (!url.trim()) return false;
  
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Normalize API URL - ensures it doesn't end with /api suffix
 * Users can input either "http://localhost:8080" or "http://localhost:8080/api"
 */
export function normalizeApiUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  
  // Remove trailing slash
  let normalized = trimmed.replace(/\/+$/, "");
  
  // Remove /api suffix if present (we'll add it back in the API client)
  if (normalized.endsWith("/api")) {
    normalized = normalized.slice(0, -4);
  }
  
  return normalized;
}