// Pure validation and DTO formatting for developer-registered OAuth applications.
// Zero I/O, zero database — safe to unit test anywhere.

import { isRedirectSchemeAllowed, type RedirectEnv } from "./sdk-validation";

export const APP_NAME_MAX_LENGTH = 100;
export const WEBSITE_URL_MAX_LENGTH = 2000;
export const REDIRECT_URI_MAX_LENGTH = 2000;
export const MAX_REDIRECT_URIS_PER_CLIENT = 10;

export type DeveloperOAuthClientDTO = {
  id: string;
  clientId: string;
  name: string;
  websiteUrl: string | null;
  redirectUris: string[];
  status: "active" | "revoked";
  createdAt: string;
  revokedAt: string | null;
};

export function validateApplicationName(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new Error("Application name must be a string.");
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error("Application name cannot be empty.");
  }
  if (trimmed.length > APP_NAME_MAX_LENGTH) {
    throw new Error(`Application name must be at most ${APP_NAME_MAX_LENGTH} characters.`);
  }
  if (/[\x00-\x1F\x7F]/.test(trimmed)) {
    throw new Error("Application name cannot contain control characters.");
  }
  return trimmed;
}

export function validateWebsiteUrl(raw: unknown, env: RedirectEnv = "development"): string {
  if (typeof raw !== "string") {
    throw new Error("Website URL must be a string.");
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error("Website URL cannot be empty.");
  }
  if (trimmed.length > WEBSITE_URL_MAX_LENGTH) {
    throw new Error(`Website URL must be at most ${WEBSITE_URL_MAX_LENGTH} characters.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Website URL is not a valid URL.");
  }
  if (parsed.protocol === "https:") {
    return trimmed;
  }
  if (env === "development" && parsed.protocol === "http:" && parsed.hostname === "localhost") {
    return trimmed;
  }
  throw new Error("Website URL must be https (or http://localhost in development).");
}

export function parseAndValidateCallbackUrls(raw: unknown, env: RedirectEnv = "development"): string[] {
  let list: string[] = [];
  if (Array.isArray(raw)) {
    list = raw.map((item) => (typeof item === "string" ? item.trim() : ""));
  } else if (typeof raw === "string") {
    list = raw
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  } else {
    throw new Error("Allowed callback URLs must be an array or comma-separated string.");
  }

  // Deduplicate preserving order
  const uniqueList = Array.from(new Set(list.filter((u) => u.length > 0)));

  if (uniqueList.length === 0) {
    throw new Error("At least one allowed callback URL is required.");
  }
  if (uniqueList.length > MAX_REDIRECT_URIS_PER_CLIENT) {
    throw new Error(`At most ${MAX_REDIRECT_URIS_PER_CLIENT} callback URLs are allowed.`);
  }

  for (const uri of uniqueList) {
    if (uri.length > REDIRECT_URI_MAX_LENGTH) {
      throw new Error(`Callback URL exceeds max length of ${REDIRECT_URI_MAX_LENGTH} characters.`);
    }
    try {
      void new URL(uri);
    } catch {
      throw new Error(`Invalid callback URL: "${uri}".`);
    }
    if (!isRedirectSchemeAllowed(uri, env)) {
      throw new Error(
        env === "production"
          ? `Callback URL must use https: "${uri}".`
          : `Callback URL must use https (or http://localhost in development): "${uri}".`
      );
    }
  }

  return uniqueList;
}

export function toOAuthClientStatus(revokedAt: Date | string | null | undefined): "active" | "revoked" {
  return revokedAt ? "revoked" : "active";
}

export function toOAuthClientDTO(row: {
  id: string;
  clientId: string;
  name: string;
  websiteUrl: string | null;
  redirectUris: string[];
  revokedAt: Date | null;
  createdAt: Date;
}): DeveloperOAuthClientDTO {
  return {
    id: row.id,
    clientId: row.clientId,
    name: row.name,
    websiteUrl: row.websiteUrl,
    redirectUris: row.redirectUris,
    status: toOAuthClientStatus(row.revokedAt),
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  };
}
