export const UNLOCK_AND_RETRY_MESSAGE = "Unlock the site and try again.";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const BODY_HINT_MAX = 120;

export function truncateBodyHint(text: string, max = BODY_HINT_MAX): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max)}…`;
}

function looksLikeUnlockResponse(input: {
  status: number;
  url?: string;
  redirected?: boolean;
  contentType?: string | null;
  bodyText: string;
}): boolean {
  const url = input.url ?? "";
  const type = input.contentType ?? "";
  const body = input.bodyText;
  return (
    input.redirected === true ||
    REDIRECT_STATUSES.has(input.status) ||
    /\/unlock(?:\?|$)/i.test(url) ||
    /text\/html/i.test(type) ||
    /<!doctype html|<html[\s>]/i.test(body) ||
    /unlock the site/i.test(body)
  );
}

export function explainNonJsonApiResponse(input: {
  status: number;
  url?: string;
  redirected?: boolean;
  contentType?: string | null;
  bodyText: string;
  fallback: string;
}): string {
  if (looksLikeUnlockResponse(input)) {
    return UNLOCK_AND_RETRY_MESSAGE;
  }
  const hint = truncateBodyHint(input.bodyText);
  if (hint) {
    return `${input.fallback} (HTTP ${input.status}: ${hint})`;
  }
  return `${input.fallback} (HTTP ${input.status})`;
}

export async function readApiJson<T extends Record<string, unknown>>(
  response: Response,
  fallback: string,
): Promise<
  | { parsed: true; status: number; body: T }
  | { parsed: false; status: number; message: string }
> {
  const contentType = response.headers.get("content-type");
  const bodyText = await response.text();
  const trimmed = bodyText.trim();
  if (trimmed) {
    try {
      return {
        parsed: true,
        status: response.status,
        body: JSON.parse(trimmed) as T,
      };
    } catch {
      // Fall through to the non-JSON explainer.
    }
  }
  return {
    parsed: false,
    status: response.status,
    message: explainNonJsonApiResponse({
      status: response.status,
      url: response.url,
      redirected: response.redirected,
      contentType,
      bodyText: trimmed,
      fallback,
    }),
  };
}

export function messageFromApiFailure(
  status: number,
  error: string | undefined,
  fallback: string,
): string {
  if (error?.trim()) return error.trim();
  if (status === 401 || status === 403) return UNLOCK_AND_RETRY_MESSAGE;
  return fallback;
}
