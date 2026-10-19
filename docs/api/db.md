# DB API

Served by the **job server**, called by **db servers**: to tell the job
server something changed, and to ask how a job is doing. A db server calls
these when a researcher publishes, resets answers, or opens the job's status
(through the [researcher API](researcher.md)).

- Contracts: `dbEndpoints` in
  [`contracts/src/endpoints/db.ts`](../../packages/contracts/src/endpoints/db.ts).
- Implementation: [`job-server/src/app.ts`](../../packages/job-server/src/app.ts).
- Caller: the mock server's
  [`routes/deployment.ts`](../../packages/mock-server/src/routes/deployment.ts).

| Endpoint | | Request | Response |
|---|---|---|---|
| [jwks](#jwks) | `GET /.well-known/jwks.json` | – | JWKS |
| [refreshDeployment](#refreshdeployment) | `POST /db/deployments/:deploymentId/refresh` | `RefreshDeploymentSchema` (optional) | `{ version }` |
| [getDeploymentStatus](#getdeploymentstatus) | `GET /db/deployments/:deploymentId/status` | – | `DeploymentStatusSchema` |
| [dropDeployment](#dropdeployment) | `DELETE /db/deployments/:deploymentId` | – | – |

`:deploymentId` is `<db host>/<jobId>` ([deployment ids](README.md#deployment-ids)).

## Authentication

Calls are signed with the job's **call key** (`ck` in the job token, see
[requestJobToken](annotator.md#requestjobtoken)):

```
x-annotinder-signature: t=<unix seconds>,s=<base64url HMAC-SHA256(callKey, "<t>\n<METHOD>\n<path>\n<body>")>
```

`path` is the request path, `body` the raw body (`""` if none). The job
server accepts `t` within 5 minutes of its clock; it knows the call key from
its own job token. 404 for a db server the job server doesn't work for.
The db server's side: `signCall` in
[`reference-db-server/src/jobTokens.ts`](../../packages/reference-db-server/src/jobTokens.ts).

## Endpoints

### jwks

`GET /.well-known/jwks.json`

The job server's public keys. Not signed and not per deployment: db servers
fetch it to verify a [token request](annotator.md#requestjobtoken).

### refreshDeployment

`POST /db/deployments/:deploymentId/refresh` → `{ version }`

Re-check the deployment now (after a publish, a pause, or a reset) instead of
at the next cache expiry. Optional body `units: "all" | ids`: also drop
cached unit content, e.g. after fixing a unit's text (units are not re-fetched
otherwise). Returns the version the job server now runs. Best effort for the
db server: if the job server is down, it picks the change up on its own.

### getDeploymentStatus

`GET /db/deployments/:deploymentId/status` → `DeploymentStatusSchema`

Progress as the job server sees it: per loop and unitset the complete,
started and leased units and coders; pending writes (outbox); memory use.
Computed from the db server's data on request, so not for frequent polling.

### dropDeployment

`DELETE /db/deployments/:deploymentId` → 204

Forget the deployment's in-memory state (cached spec, units, coders, leases).
Writes still waiting for the db server are kept. The next request loads the
deployment again from the db server.
