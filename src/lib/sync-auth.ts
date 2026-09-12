import "server-only";

import { getAppPassword } from "./app-gate";
import {
  authorizeSyncAccess,
  getSyncSecret,
  readBearerToken,
  readNamedCookie,
  writeProtectionEnabled,
  type SyncAuthResult,
} from "./sync-auth-core";

export {
  getSyncSecret,
  readBearerToken,
  readNamedCookie,
  writeProtectionEnabled,
};

export function authorizeDecisionRequest(request: Request): SyncAuthResult {
  return authorizeSyncAccess({
    password: getAppPassword(),
    syncSecret: getSyncSecret(),
    bearer: readBearerToken(request.headers.get("authorization")),
    cookieToken: readNamedCookie(request.headers.get("cookie")),
  });
}
