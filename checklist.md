# Multi-Tenant K8s Deployment System using Helm & Kind (Local Dev)

---

## System Overview

This system dynamically deploys predefined services per tenant (based on `company_code`) into isolated Kubernetes namespaces using Helm. Services include:

- Admin Web Frontend
- Backend API Server (Hono.js)
- User Web Frontend
- PostgreSQL DB
- Redis

Deployment is triggered by an API or CLI tool, interacting with the K8s control plane.

Monitoring: Prometheus + Grafana for local, GCP-native stack in production.

---

## Deployment Architecture Diagram

> _See attached diagram image._

---

## Detailed Step-by-Step Checklist

### 1. ✅ Local Environment Bootstrap

#### 1.1 Install Dependencies

- [x] Docker
- [x] Kind
- [x] kubectl
- [x] Helm
- [x] Node.js & pnpm
- [ ] Prometheus & Grafana Helm charts

#### 1.2 Create Kind Cluster

- [x] Create cluster using `scripts/create-kind-cluster.sh` (which uses `kind-config.yaml`)

```bash
# kind create cluster --name multi-tenant-dev --config kind-config.yaml
scripts/create-kind-cluster.sh
```

#### 1.3 Verify Cluster

- [x] Basic verification

```bash
kubectl cluster-info --context kind-multi-tenant-dev
```

- [x] Detailed verification using script

```bash
scripts/check-cluster-status.sh
```

### 2. ✅ POC Application Preparation

- [x] Create `applications/` directory structure (`backend-api`, `admin-frontend`, `user-frontend`)
- [x] **Backend API (Hono.js):**
  - [x] Implement basic API (e.g., `/health`, `/config/:company_code` endpoints)
  - [x] Add database connection (`pg` library) using env vars
  - [x] Create `Dockerfile`
  - [x] Build Docker image locally (`docker build ...`)
  - [x] Test image locally (Optional)
  - [x] Tag image for registry (`docker tag ... jinseok93338/backend-api-poc:v0.1.2`)
  - [x] Log in to container registry (`docker login`)
  - [x] Push image to registry (`docker push jinseok93338/backend-api-poc:v0.1.2`)
- [ ] **Admin Frontend:**
  - [ ] Implement basic UI
  - [ ] Create `Dockerfile`
  - [ ] Build Docker image
  - [ ] Test image locally
  - [ ] Tag image for registry
  - [ ] Log in to registry
  - [ ] Push image to registry
- [x] **User Frontend:**
  - [x] Implement basic UI (Vite+TS+TanStack Query)
  - [x] Add API call to `/config/:company_code`
  - [x] Create `Dockerfile` (using Nginx)
  - [x] Build Docker image (`docker build ...`)
  - [x] Test image locally (Optional)
  - [x] Tag image for registry (`docker tag ... jinseok93338/front-end-user:v0.1.2`)
  - [x] Log in to registry (`docker login`)
  - [x] Push image to registry (`docker push jinseok93338/front-end-user:v0.1.2`)

### 3. ✅ Helm Charts Preparation & Base Deployment

**Strategy:**

- [x] Use stable, external Bitnami charts for PostgreSQL and Redis.
- [x] Create custom Helm charts for `admin-frontend`, `user-frontend`, `backend-api`.
- [x] All chart deployments will be configured dynamically (future: by Core API Server).

**Chart Structure & Details:**

```
helm/
  ├── admin-frontend/  # Custom chart (TODO)
  ├── user-frontend/   # Custom chart (Prepared)
  └── backend-api/     # Custom chart (Prepared)
```

**Key Considerations:**

- [x] **Configuration:** Custom charts accept configurations via `values.yaml`.
- [x] **PostgreSQL Migration:** Handled by Kubernetes Job within `backend-api` chart (using Helm hooks).
- [x] **External Charts (PostgreSQL):** Deployed successfully using Bitnami chart.
- [ ] **External Charts (Redis):** TODO.

**Base Deployment (Single Namespace: `base-app`):**

- [x] Create `base-app` namespace.
- [x] Deploy PostgreSQL (`be-db` release using Bitnami chart).
- [x] Deploy Backend API (`backend-api` release using local chart, migration hook executed).
- [x] Deploy User Frontend (`user-frontend` release using local chart).
- [x] Verified basic frontend-backend interaction (after manual DB seeding).

> **Naming Convention (Future Goal)**:
> `release-name = <company_code>-<service_name>`

### 4. ✅ Monitoring Stack (Local Only)

#### 4.1 Add Prometheus & Grafana Repo

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update
```

#### 4.2 Deploy Monitoring Stack

```bash
helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace
```

#### 4.3 Access Grafana

```bash
kubectl port-forward svc/monitoring-grafana -n monitoring 3000:80
```

- Default credentials: `admin/prom-operator`

### 5. ✅ Core API Server (Hono.js)

#### 5.1 Local Dev

- Run outside the cluster (recommended for now)
- Use `@kubernetes/client-node` for interaction

#### 5.2 Core Responsibilities

- [ ] Create Namespace per `company_code`
- [ ] Deploy services using Helm via CLI (`child_process.exec`)
- [ ] Manage Helm release naming
- [ ] Inject environment variables (e.g., `company_code`, DB creds)
- [ ] Stop or delete Helm releases on request

#### Example: Create Namespace

```ts
import k8s from "@kubernetes/client-node";
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
await k8sApi.createNamespace({
  metadata: {name: "dor"},
});
```

#### Example: Install Helm Chart

```bash
helm install dor-postgres ./helm/postgres \
  --namespace dor \
  --set company_code=DOR
```

### 6. ✅ Service Provisioning Flow

#### 6.1 Provision New Tenant

- [ ] Generate namespace from company_code (e.g., `DOR` → `dor`)
- [ ] Deploy PostgreSQL with creds
- [ ] Deploy Redis
- [ ] Deploy backend API (with DB URL, Redis host injected)
- [ ] Deploy admin & user frontend (base URLs injected)

#### 6.2 Stopping Tenant

- [ ] Use `helm uninstall` on all releases
- [ ] Keep namespace (pause mode)

#### 6.3 Deleting Tenant

- [ ] `helm uninstall` all
- [ ] `kubectl delete namespace <company_code>`

### 7. ✅ Networking & DNS (Optional)

- Local development can use Ingress + `nip.io` for simple DNS routing
- Example:

```yaml
host: dor-admin.127.0.0.1.nip.io
```
