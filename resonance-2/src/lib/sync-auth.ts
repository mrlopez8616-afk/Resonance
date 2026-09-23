import "server-only";

import {
  authorizeSyncAccess,
  getSyncSecret,
  readBearerToken,
  writeProtectionEnabled,
  type SyncAuthResult,
} from "./sync-auth-core";

export {
  getSyncSecret,
  readBearerToken,
  writeProtectionEnabled,
};

export function authorizeSyncRequest(request: Request): SyncAuthResult {
  return authorizeSyncAccess({
    syncSecret: getSyncSecret(),
    bearer: readBearerToken(request.headers.get("authorization")),
  });
}

export function authorizeFillRequest(request: Request): SyncAuthResult {
  return authorizeSyncRequest(request);
}
