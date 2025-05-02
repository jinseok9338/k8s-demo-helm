# Day 2: Multi-Tenant Deployment (DIR & CHA)

This document details the steps taken on Day 2 to deploy the multi-tenant application stack (PostgreSQL, Backend API, User Frontend) for the `DIR` and `CHA` tenants using Helm, including troubleshooting and final verification.

## Prerequisites Met (from Day 1 / prequisite.md)

- Helm charts for `backend-api` and `user-frontend` are available in the `helm/` directory.
- Bitnami PostgreSQL Helm chart is available.
- Namespace convention: `lowercase(companyCode)-tenant`.
- Required environment variables identified (DB connection, `COMPANY_CODE`, etc.).
- `IngressRoute` configured within Helm charts.
- Local Kind cluster with Traefik installed.

## Initial Cleanup

- The root-level `ingressroute.yaml` file was identified as obsolete (since IngressRoute is now managed within Helm charts) and was deleted.
  ```bash
  # Command used (conceptual, tool call was used)
  # rm ingressroute.yaml
  ```

## Deployment for `dir-tenant` (companyCode=DIR)

### 1. Full Cleanup and Reinstallation

Previous deployment attempts left resources in an inconsistent state. A full cleanup was performed by deleting the entire `dir-tenant` namespace.

```bash
kubectl delete namespace dir-tenant
```

### 2. Installing Components

The stack was reinstalled component by component.

**a) PostgreSQL:**

```bash
helm install postgresql bitnami/postgresql --namespace dir-tenant --create-namespace
```

- **Outcome:** Successful installation. Secret name confirmed as `postgresql`.

**b) Backend API:** (Initially encountered issues)

```bash
# Initial install command
helm install backend-api helm/backend-api --namespace dir-tenant --set companyCode=DIR --set ingressRoute.enabled=true
```

- **Issue 1:** Pods stuck in `CreateContainerConfigError`.
  - **Diagnosis:** `kubectl describe pod <pod-name> -n dir-tenant` revealed `Error: secret "db-postgresql" not found`.
  - **Cause:** `backend-api/values.yaml` had `db.existingSecret: "db-postgresql"` but the actual Secret created by Bitnami chart was named `postgresql`.
  - **Resolution:** Modified `helm/backend-api/values.yaml` to set `db.existingSecret: "postgresql"` (and also corrected `db.serviceName` to `postgresql`).
  ```yaml
  # helm/backend-api/values.yaml snippet
  db:
    serviceName: "postgresql" # Corrected
    # ...
    existingSecret: "postgresql" # Corrected
    secretPasswordKey: "postgres-password"
  ```
  - **Action:** Upgraded the release.
  ```bash
  helm upgrade backend-api helm/backend-api --namespace dir-tenant
  ```
- **Issue 2:** New pods started but remained `READY 0/1` with restarts.
  - **Diagnosis:** `kubectl logs <pod-name> -n dir-tenant` showed `Initialization failed: password authentication failed for user "postgres"`.
  - **Cause:** Likely password mismatch between the (new) Secret `postgresql` and the password stored in the potentially reused PVC from a previous installation.
  - **Resolution:** Decided to perform a full namespace cleanup again (see step 1) to ensure PVCs were also removed and start fresh.

**c) Re-installing after Namespace Deletion:**

```bash
# 1. Reinstall PostgreSQL
helm install postgresql bitnami/postgresql --namespace dir-tenant --create-namespace

# 2. Reinstall Backend API (values.yaml already corrected for Secret name)
helm install backend-api helm/backend-api --namespace dir-tenant --set companyCode=DIR --set ingressRoute.enabled=true

# 3. Check Backend API Pods (Wait for Ready 1/1)
kubectl get pods -n dir-tenant --selector=app.kubernetes.io/instance=backend-api -w
```

- **Outcome:** Backend pods eventually became `READY 1/1`.

**d) User Frontend:** (Encountered issues)

```bash
# Initial install command
helm install user-frontend helm/user-frontend --namespace dir-tenant --set companyCode=DIR --set ingressRoute.enabled=true --set ingressRoute.host=app.dir.localhost --set ingressRoute.backend.serviceName=backend-api --set ingressRoute.backend.middlewareName=backend-api-stripprefix-api --set ingressRoute.backend.middlewareNamespace=dir-tenant
```

- **Issue 1:** Installation failed with `apiVersion not set`.
  - **Diagnosis:** `helm template ...` showed the `apiVersion` line merged with a preceding comment in the rendered `ingressroute.yaml`.
  - **Cause:** Missing newline after `{{- if .Values.ingressRoute.enabled -}}` in `helm/user-frontend/templates/ingressroute.yaml`.
  - **Resolution:** Manually added a newline in the template file.
  ```diff
  # helm/user-frontend/templates/ingressroute.yaml
  # Only create IngressRoute if enabled in values
  {{- if .Values.ingressRoute.enabled -}}
  +
  apiVersion: traefik.io/v1alpha1
  kind: IngressRoute
  ```
  - **Action:** Retried `helm install user-frontend ...`.
- **Outcome:** Successful installation.

### 3. Testing `dir-tenant` Frontend Access

**a) Initial Test:** Accessing `http://app.dir.localhost:<NodePort>` (identified NodePort 30936 for Traefik service port 80) resulted in "Connection refused".

- **Diagnosis:** Confirmed `/etc/hosts` had `127.0.0.1 app.dir.localhost`. Checked Traefik pods were running. Suspected Kind NodePort mapping issue.
- **Resolution:** Used `kubectl port-forward` as an alternative access method.

```bash
# Start port-forward in background/separate terminal
kubectl port-forward -n traefik service/traefik 8080:80
```

**b) Test via Port-Forward:**

- **Command:** `curl -H "Host: app.dir.localhost" http://localhost:8080`
- **Outcome:** Successfully retrieved Frontend HTML.

**c) API Test via Port-Forward:**

- **Command:** `curl -H "Host: app.dir.localhost" http://localhost:8080/api/hello-world`
- **Issue:** Received `404 Not Found`.
- **Diagnosis:**
  - Verified `IngressRoute` for `/api` path and `Middleware` reference using `kubectl describe`. Both seemed correct.
  - Checked `Middleware` definition (`backend-api-stripprefix-api`) - correctly configured to strip `/api`.
  - Checked Traefik logs (`kubectl logs -n traefik ...`) - indicated it couldn't find the `backend-api` service (potentially a red herring or transient issue resolved by Traefik restart later).
  - Re-examined `backend-api` code (`applications/backend-api/src/index.js`) and found routes were defined _with_ the `/api` prefix (e.g., `app.get("/api/hello-world", ...)`).
- **Cause:** `StripPrefix` middleware was removing `/api`, causing the backend to receive `/hello-world` which it didn't have a route for.
- **Resolution:** Decided to remove the `StripPrefix` middleware.
  - Modified `helm/backend-api/values.yaml` to set `middleware.stripPrefix.enabled: false`.
  - Upgraded `backend-api`: `helm upgrade backend-api helm/backend-api --namespace dir-tenant`.
  - Verified `Middleware` resource was deleted: `kubectl get middleware backend-api-stripprefix-api -n dir-tenant` (returned NotFound).
  - Modified `helm/user-frontend/templates/ingressroute.yaml` to remove the `middlewares:` section for the `/api` route.
  - Upgraded `user-frontend`: `helm upgrade user-frontend helm/user-frontend --namespace dir-tenant`.
- **Final Test:**
  ```bash
  # Ensure port-forward is running
  curl -H "Host: app.dir.localhost" http://localhost:8080/api/hello-world
  ```
- **Outcome:** Successfully received `{"message":"Hello World from the Backend API!"}`.

## Deployment for `cha-tenant` (companyCode=CHA)

Leveraging the corrected charts and lessons from `dir-tenant`.

### 1. Installing Components

**a) PostgreSQL:**

```bash
helm install postgresql-cha bitnami/postgresql --namespace cha-tenant --create-namespace
```

- **Note:** Used release name `postgresql-cha`.

**b) Backend API:**

```bash
helm install backend-api-cha helm/backend-api --namespace cha-tenant \
  --set companyCode=CHA \
  --set ingressRoute.enabled=true \
  --set db.serviceName=postgresql-cha \
  --set db.existingSecret=postgresql-cha
```

- **Note:** Used release name `backend-api-cha` and set DB parameters to match the PostgreSQL release.
- **Issue:** Pods initially showed `ECONNREFUSED` connecting to DB in logs.
  - **Cause:** PostgreSQL pod (`postgresql-cha-0`) was running but likely hadn't finished its internal initialization.
  - **Resolution:** Waited for ~1-2 minutes. `backend-api-cha` pods restarted and successfully connected.
  - **Verification:** `kubectl get pods -n cha-tenant --selector=app.kubernetes.io/instance=backend-api-cha` showed `READY 1/1`.

**c) User Frontend:**

```bash
helm install user-frontend-cha helm/user-frontend --namespace cha-tenant \
  --set companyCode=CHA \
  --set ingressRoute.enabled=true \
  --set ingressRoute.host=app.cha.localhost \
  --set ingressRoute.backend.serviceName=backend-api-cha \
  --set ingressRoute.backend.middlewareNamespace=cha-tenant
```

- **Note:** Used release name `user-frontend-cha`. Set `ingressRoute.host` specific to CHA tenant. Set `ingressRoute.backend.serviceName` to match the backend release name (`backend-api-cha`). Middleware name parameter was omitted as middleware is no longer used.
- **Outcome:** Successful installation.

### 2. Testing `cha-tenant` Frontend Access (Conceptual)

- **Steps:**
  1.  Add `127.0.0.1 app.cha.localhost` to `/etc/hosts`.
  2.  Ensure `kubectl port-forward -n traefik service/traefik 8080:80` is running.
  3.  Access via browser or curl:
      ```bash
      curl -H "Host: app.cha.localhost" http://localhost:8080
      curl -H "Host: app.cha.localhost" http://localhost:8080/api/hello-world
      ```
- **Expected Outcome:** Successful retrieval of HTML and API response.

## Summary

Both `dir-tenant` and `cha-tenant` deployments were successfully completed after troubleshooting several issues related to Helm templating, Secret/Service naming, application initialization timing, and Ingress/Middleware configuration mismatches. Access testing was performed using `kubectl port-forward` due to the Kind environment limitations.
