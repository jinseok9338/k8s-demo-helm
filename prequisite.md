# Deployment Prerequisites and Configuration

This document outlines the necessary steps, configurations, and environment variables required to deploy the multi-tenant application stack using Helm.

## 1. Required Helm Charts

The deployment consists of the following Helm charts:

- **PostgreSQL:** Database provided by the Bitnami Helm chart (`bitnami/postgresql`).
- **Backend API:** Custom Helm chart located in `helm/backend-api`.
- **User Frontend:** Custom Helm chart located in `helm/user-frontend`.

## 2. Namespace Convention

Deployments are tenant-specific. The Kubernetes namespace for each tenant is derived from a `companyCode`.

- **Rule:** `lowercase(companyCode)-tenant`
- **Example:**
  - `companyCode=DIR` -> Namespace: `dir-tenant`
  - `companyCode=CHA` -> Namespace: `cha-tenant`

## 3. Environment Variables

The application containers require specific environment variables to be set during deployment.

### Backend API (`helm/backend-api`)

| Variable             | Description                                    | Source                                                                                   | Example Value (for dir-tenant)                            | Helm Value                  |
| :------------------- | :--------------------------------------------- | :--------------------------------------------------------------------------------------- | :-------------------------------------------------------- | :-------------------------- |
| `DB_HOST`            | PostgreSQL service hostname                    | `values.yaml` (`db.serviceName`) + `.namespace.svc.cluster.local` (or just service name) | `postgresql.dir-tenant.svc.cluster.local` or `postgresql` | `.Values.db.serviceName`    |
| `DB_PORT`            | PostgreSQL service port                        | `values.yaml` (`db.port`)                                                                | `5432`                                                    | `.Values.db.port`           |
| `DB_USER`            | PostgreSQL username                            | `values.yaml` (`db.user`)                                                                | `postgres`                                                | `.Values.db.user`           |
| `DB_NAME`            | PostgreSQL database name                       | `values.yaml` (`db.dbName`)                                                              | `postgres`                                                | `.Values.db.dbName`         |
| `DB_PASSWORD`        | PostgreSQL password                            | Kubernetes Secret (`db.existingSecret`, `db.secretPasswordKey`)                          | `[SECRET_VALUE]`                                          | `valueFrom.secretKeyRef`    |
| `COMPANY_CODE`       | Tenant identifier                              | `values.yaml` (`companyCode`) or `--set companyCode=...`                                 | `DIR`                                                     | `.Values.companyCode`       |
| `PORT`               | Application listening port                     | `values.yaml` (`service.port`)                                                           | `3000`                                                    | `.Values.service.port`      |
| `MASTER_BACKEND_URL` | URL of the master backend service (for config) | `values.yaml` (`masterBackend.url`)                                                      | `http://master-backend:3001` (example)                    | `.Values.masterBackend.url` |
| `MASTER_BACKEND_URL` | URL of the master backend service (for config) | `values.yaml` (`masterBackend.url`)                                                      | `http://master-backend:3001` (example)                    | `.Values.masterBackend.url` |

### User Frontend (`helm/user-frontend`)

| Variable       | Description       | Source                                                   | Example Value (for dir-tenant) | Helm Value            |
| :------------- | :---------------- | :------------------------------------------------------- | :----------------------------- | :-------------------- |
| `COMPANY_CODE` | Tenant identifier | `values.yaml` (`companyCode`) or `--set companyCode=...` | `DIR`                          | `.Values.companyCode` |

**(Note:** The Frontend uses an `entrypoint.sh` script to make `COMPANY_CODE` available to the Nginx container, which then injects it into a `config.js` file for potential use by the JavaScript application.)

## 4. IngressRoute Configuration (`helm/user-frontend`)

The `user-frontend` chart creates an `IngressRoute` resource for Traefik.

- **Activation:** Set `ingressRoute.enabled: true` in `values.yaml` or via `--set ingressRoute.enabled=true`.
- **Dynamic Values:**
  - `ingressRoute.host`: Needs to be tenant-specific (e.g., `app.dir.localhost`). Set via `values.yaml` or `--set ingressRoute.host=...`.
  - `ingressRoute.backend.serviceName`: Should point to the correct `backend-api` service name for the tenant. Typically based on the Helm release name of the `backend-api` (e.g., `backend-api`). Set via `values.yaml` or `--set ingressRoute.backend.serviceName=...`.
  - `ingressRoute.backend.middlewareName`: Should point to the `StripPrefix` middleware created by the `backend-api` chart. The name follows the pattern `{{ backend-api-release-name }}-stripprefix-api` (e.g., `backend-api-stripprefix-api`). Set via `values.yaml` or `--set ingressRoute.backend.middlewareName=...`.
  - `ingressRoute.backend.middlewareNamespace`: The namespace where the backend middleware exists (e.g., `dir-tenant`). Set via `values.yaml` or `--set ingressRoute.backend.middlewareNamespace=...`.

## 5. Helm Deployment Example (for `dir-tenant`)

Assumes `dir-tenant` namespace needs to be created.

1.  **Install PostgreSQL:**

    ```bash
    helm install postgresql bitnami/postgresql --namespace dir-tenant --create-namespace # Add --set for non-default user/password/db if needed
    ```

    _(Wait for PostgreSQL to be ready)_

2.  **Install Backend API:**

    ```bash
    # Assuming backend-api values.yaml has correct db.* settings pointing to 'postgresql' secret/service
    helm install backend-api helm/backend-api --namespace dir-tenant --set companyCode=DIR --set ingressRoute.enabled=true
    ```

3.  **Install User Frontend:**
    ```bash
    helm install user-frontend helm/user-frontend --namespace dir-tenant \
      --set companyCode=DIR \
      --set ingressRoute.enabled=true \
      --set ingressRoute.host=app.dir.localhost \
      --set ingressRoute.backend.serviceName=backend-api \
      --set ingressRoute.backend.middlewareName=backend-api-stripprefix-api \
      --set ingressRoute.backend.middlewareNamespace=dir-tenant
    ```

**(Note:** Ensure the `backend-api` service name (`backend-api`) and middleware name (`backend-api-stripprefix-api`) used in the `user-frontend` install command match the actual names created by the `backend-api` deployment.)
