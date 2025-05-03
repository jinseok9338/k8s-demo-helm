# Master Backend API Enhancement Plan

**Goal:** Extend the Master Backend API to manage Kubernetes tenant deployments, monitor their status, and provide necessary information for a future dashboard frontend.

## 1. Overall Architecture Considerations

- **Kubernetes Interaction:** Use the `@kubernetes/client-node` library for programmatic interaction with the Kubernetes API (creating namespaces, checking resource status).
- **Helm Interaction:** Use Node.js `child_process` module (specifically `spawn` for better stream handling) to execute Helm CLI commands (`helm install`, `helm uninstall`). Helm SDKs for Node.js are less mature or common.
- **Asynchronous Operations:** Deployments involve long-running Helm processes. API endpoints initiating deployments should return quickly (e.g., with a job ID), and the actual work should happen in the background.
- **Real-time Updates:** Use **WebSockets** for streaming deployment logs and potentially pushing health status updates to the frontend. Polling for logs is inefficient, and polling for health status might not be sufficiently real-time depending on requirements. A WebSocket connection per relevant task/tenant seems appropriate. (Hono has WebSocket support, or libraries like `ws` can be used).
- **State Management:** The Master Backend needs its own database (the PostgreSQL instance already set up) to store information about tenants, their deployed resources (Helm release names), deployment status, and potentially configurations. The `tenants` table needs expansion or related tables.
- **Error Handling:** Robust error handling is crucial for Kubernetes API calls and Helm command execution. Errors should be logged and potentially reported back via WebSocket or status API.
- **Security:**
  - Ensure the Master Backend has appropriate RBAC permissions in Kubernetes to manage namespaces and resources.
  - Secure the API endpoints and WebSocket connections (authentication/authorization likely needed in a real system, though not explicitly requested yet).
  - Validate input carefully (e.g., `companyCode`).

## 2. Detailed Feature Plan

### Feature 1: Cluster Health Check

- **Goal:** Provide an endpoint and real-time mechanism to check the connectivity and basic health of the target Kubernetes cluster.
- **API Endpoint:**
  - `GET /api/cluster/health`: Returns the current cluster connection status.
    - **Response (Success):** `{ "status": "ok", "message": "Connected to Kubernetes cluster", "clusterVersion": "v1.xx.x" }`
    - **Response (Error):** `{ "status": "error", "message": "Failed to connect to Kubernetes cluster", "error": "..." }` (Status Code: 503 Service Unavailable)
- **WebSocket Endpoint:**
  - `ws /ws/cluster/status`: Pushes status updates (e.g., connected, disconnected) or periodic health pings to connected frontend clients.
- **Backend Logic:**
  1.  **API:** Use `@kubernetes/client-node`'s `CoreV1Api` or similar to perform a simple, non-intrusive check (e.g., `readNamespace("default")` or get cluster version info). Handle potential connection errors.
  2.  **WebSocket:** Periodically perform the health check. If the status changes (e.g., connection lost/restored), broadcast the new status to all connected clients on this WebSocket endpoint.
- **Data Model:** No specific DB storage needed for this, status is checked on demand or periodically.

### Feature 2: Tenant Deployment & Log Streaming

- **Goal:** API to initiate the deployment of a full tenant stack (Namespace, DB, Backend, Frontend) and stream the Helm deployment logs in real-time.
- **API Endpoint:**
  - `POST /api/tenants`: Initiates the creation and deployment process for a new tenant.
    - **Request Body:** `{ "companyCode": "TENANT_ID", "config": { ... } }` (e.g., specific versions, initial settings).
    - **Response (Success):** `{ "status": "pending", "message": "Tenant deployment initiated", "companyCode": "TENANT_ID", "deploymentJobId": "unique-job-id" }` (Status Code: 202 Accepted)
    - **Response (Error):** `{ "status": "error", "message": "Invalid request or tenant already exists", "error": "..." }` (Status Code: 400 Bad Request or 409 Conflict)
- **WebSocket Endpoint:**
  - `ws /ws/tenants/:companyCode/deploy/logs`: Streams logs (`stdout`/`stderr`) from the Helm install processes for the specified tenant deployment. Frontend connects after receiving the `deploymentJobId` or based on `companyCode`.
- **Backend Logic:**
  1.  **API (`POST /api/tenants`):**
      - Validate `companyCode` and config. Check if tenant already exists (in DB).
      - Generate a unique `deploymentJobId`.
      - Store initial tenant info and `pending` status in the Master Backend DB.
      - Asynchronously trigger the deployment process (e.g., add to a job queue or start directly). Return 202 Accepted immediately.
  2.  **Deployment Process (Async):**
      - Generate namespace name (e.g., `cha-tenant`).
      - Use `@kubernetes/client-node` to create the namespace. Update DB status.
      - Use `child_process.spawn('helm', ['install', 'postgresql-cha', ...])`:
        - Capture `stdout` and `stderr`.
        - Stream captured output lines over the specific WebSocket (`/ws/tenants/CHA/deploy/logs`). Prepend lines with `[helm-pg]` or similar for clarity.
        - Wait for the process to exit. Check exit code. Update DB status (e.g., `pg_deployed`, `pg_failed`).
      - If successful, repeat for `backend-api-cha`: `spawn('helm', ['install', 'backend-api-cha', ...])`, streaming logs prefixed with `[helm-be]`. Update DB status.
      - If successful, repeat for `user-frontend-cha`: `spawn('helm', ['install', 'user-frontend-cha', ...])`, streaming logs prefixed with `[helm-fe]`. Update DB status.
      - Send a final "Deployment Complete" or "Deployment Failed" message over the WebSocket. Update final tenant status in DB.
- **Data Model:**
  - `tenants` table needs columns like `status` (e.g., `pending`, `deploying_pg`, `deploying_be`, `active`, `failed`), `lastDeploymentLog`, `helmReleaseNames` (object/JSON storing names like `postgresql-cha`, etc.).

### Feature 3: Deployed Resource Health Check

- **Goal:** API to check the health/readiness of deployed resources for a specific tenant.
- **API Endpoint:**
  - `GET /api/tenants/:companyCode/health`: Returns the aggregated health status of the tenant's resources.
    - **Response (Success):** `{ "companyCode": "CHA", "status": "healthy|unhealthy|degraded", "details": { "postgresql": { "status": "ready|not_ready", "readyPods": 1, "totalPods": 1 }, "backendApi": { "status": "ready|not_ready", "readyPods": 2, "totalPods": 2 }, "userFrontend": { "status": "ready|not_ready", "readyPods": 2, "totalPods": 2 } } }`
    - **Response (Error):** `{ "error": "Tenant not found" }` (Status Code: 404 Not Found)
- **WebSocket Endpoint (Optional but Recommended):**
  - `ws /ws/tenants/:companyCode/health/updates`: Pushes updates to the frontend when the health status of any component changes.
- **Backend Logic:**
  1.  **API:**
      - Get `companyCode` from path. Check if tenant exists in DB.
      - Construct expected resource labels/selectors based on stored Helm release names or conventions.
      - Use `@kubernetes/client-node`'s `AppsV1Api` and `CoreV1Api`.
      - Fetch Pods for PostgreSQL StatefulSet/Deployment in the tenant namespace. Check `status.phase === 'Running'` and `status.conditions` type `Ready` status `True`. Count ready vs. total pods.
      - Fetch Pods for Backend API Deployment. Check status and readiness.
      - Fetch Pods for User Frontend Deployment. Check status and readiness.
      - Aggregate results into the response format.
  2.  **WebSocket:** Implement a watcher using `@kubernetes/client-node` on Pods in tenant namespaces. When relevant Pod statuses change, recalculate the tenant health and push updates to subscribed clients for that `companyCode`.
- **Data Model:** Primarily relies on live Kubernetes data, but might cache the last known status in the `tenants` table.

### Feature 4: Resource Overview & Access URLs

- **Goal:** API to provide a summary of a tenant's deployed resources, including the primary access URL for the frontend.
- **API Endpoints:**
  - `GET /api/tenants`: Returns a list of all managed tenants and their overall status.
    - **Response:** `[ { "companyCode": "DIR", "status": "active", "name": "Directory Tenant Inc." }, { "companyCode": "CHA", "status": "active", "name": "Chaos Engineering Ltd." } ]`
  - `GET /api/tenants/:companyCode`: Returns detailed overview for a specific tenant.
    - **Response:** `{ "companyCode": "CHA", "status": "active", "name": "Chaos Engineering Ltd.", "namespace": "cha-tenant", "resources": { "postgresql": { "releaseName": "postgresql-cha", "status": "..." }, "backendApi": { "releaseName": "backend-api-cha", "status": "..." }, "userFrontend": { "releaseName": "user-frontend-cha", "status": "..." } }, "accessUrl": "http://app.cha.localhost" }` (URL construction logic needed)
    - **Response (Error):** `{ "error": "Tenant not found" }` (Status Code: 404 Not Found)
- **Backend Logic:**
  1.  Fetch tenant data (including status, Helm release names) from the Master Backend DB.
  2.  For the detailed endpoint (`/api/tenants/:companyCode`):
      - Use `@kubernetes/client-node` to potentially fetch live status for Deployments/StatefulSets if needed (or rely on cached status from Feature 3).
      - **Construct Access URL:**
        - Fetch the relevant `IngressRoute` (or `Ingress` if using GKE Ingress later) resource from the tenant namespace (e.g., `user-frontend-cha`).
        - Extract the hostname from the `spec.routes[*].match` or `spec.rules[*].host` field (e.g., `app.cha.localhost`).
        - Prepend `http://` (or `https://` if TLS is configured later).
        - **Note:** For local Kind testing without mapped ports, this URL won't be directly accessible externally, but it represents the intended FQDN. The API could potentially return both the intended URL and instructions for local access (`kubectl port-forward`).
- **Data Model:** Requires `tenants` table to store basic info, status, and associated Helm release names.

## 3. Step-by-Step Implementation Plan

1.  **Refine Database Schema:** Update `src/db/schema.ts` for the `tenants` table to include `status`, `helmReleaseNames` (JSON or separate table?), etc. Generate and apply new migrations.
2.  **Implement Cluster Health Check:** Create the `GET /api/cluster/health` endpoint and the basic WebSocket logic (`/ws/cluster/status`).
3.  **Implement Tenant Deployment API:** Create the `POST /api/tenants` endpoint. Implement the asynchronous deployment logic using `child_process.spawn` for Helm commands. Set up the `/ws/tenants/:companyCode/deploy/logs` WebSocket for streaming logs. Update tenant status in DB throughout the process.
4.  **Implement Resource Health Check API:** Create the `GET /api/tenants/:companyCode/health` endpoint using `@kubernetes/client-node` to query Pod statuses.
5.  **Implement Resource Overview API:** Create `GET /api/tenants` and `GET /api/tenants/:companyCode`. Fetch data from DB and Kubernetes (especially IngressRoute/Ingress for URL).
6.  **Implement Real-time Health Updates (Optional):** Set up Kubernetes watchers and the `/ws/tenants/:companyCode/health/updates` WebSocket.
7.  **Develop Frontend:** Create a separate frontend project to interact with these APIs and WebSockets.
8.  **Refinement & Testing:** Thoroughly test error conditions, edge cases, and concurrent deployments. Add security measures as needed.
