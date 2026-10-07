import "server-only";

import {
  authorizeFitnessAccess,
  authorizeSyncAccess,
  FITNESS_TOKEN_HEADER,
  getFitnessIngestToken,
  getSyncSecret,
  readBearerToken,
  writeProtectionEnabled,
  type FitnessAuthResult,
  type SyncAuthResult,
} from "./sync-auth-core";

export {
  FITNESS_TOKEN_HEADER,
  getFitnessIngestToken,
  getSyncSecret,
  readBearerToken,
  writeProtectionEnabled,
};

export function authorizeFitnessRequest(request: Request): FitnessAuthResult {
  const header = request.headers.get(FITNESS_TOKEN_HEADER)?.trim() ?? "";
  return authorizeFitnessAccess({
    token: getFitnessIngestToken(),
    bearer: readBearerToken(request.headers.get("authorization")),
    headerToken: header || null,
  });
}

export function authorizeSyncRequest(request: Request): SyncAuthResult {
  return authorizeSyncAccess({
    syncSecret: getSyncSecret(),
    bearer: readBearerToken(request.headers.get("authorization")),
  });
}

export function authorizeFillRequest(request: Request): SyncAuthResult {
  return authorizeSyncRequest(request);
}
