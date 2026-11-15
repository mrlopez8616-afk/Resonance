import "server-only";

import {
  authorizeFitnessAccess,
  authorizeSyncAccess,
  FITNESS_TOKEN_HEADER,
  getFitnessIngestToken,
  getSyncSecret,
  readBearerToken,
  readIngestCredentials,
  writeProtectionEnabled,
  type FitnessAuthResult,
  type IngestCredentials,
  type SyncAuthResult,
} from "./sync-auth-core";

export {
  FITNESS_TOKEN_HEADER,
  getFitnessIngestToken,
  getSyncSecret,
  readBearerToken,
  readIngestCredentials,
  writeProtectionEnabled,
  type IngestCredentials,
};

export function authorizeFitnessRequest(request: Request): FitnessAuthResult {
  return authorizeFitnessAccess({
    token: getFitnessIngestToken(),
    presented: readIngestCredentials(request.headers).tokens,
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
