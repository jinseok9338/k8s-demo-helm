# Deploying Multi-Tenant Application on GKE Autopilot

This document outlines considerations and configuration adjustments needed to deploy the multi-tenant application stack (PostgreSQL, Backend API, User Frontend) from the local Kind environment to Google Kubernetes Engine (GKE) using Autopilot mode.

## 1. GKE Autopilot Overview

- **Managed Nodes:** Autopilot manages the cluster's nodes, automatically scaling them based on workload requirements. You don't need to configure or manage node pools or machine types.
- **Pay-per-Pod:** Costs are primarily based on the CPU, memory, and ephemeral storage resources requested by your running Pods, rather than paying for entire nodes.
- **Simplified Operations:** Reduces cluster management overhead.

## 2. Key Configuration Changes and Considerations

### 2.1. Image Registry

- **Requirement:** Docker images must be hosted in a registry accessible by GKE, preferably Google Artifact Registry (GAR) or Google Container Registry (GCR).
- **Action:**
  - Push the `backend-api` and `user-frontend` images to GAR/GCR.
  - Update the `image.repository` values in `helm/backend-api/values.yaml` and `helm/user-frontend/values.yaml` to point to the new registry paths (e.g., `asia-northeast3-docker.pkg.dev/YOUR_PROJECT_ID/YOUR_REPO/backend-api-poc`).

### 2.2. Database Strategy (Cloud SQL Recommended)

- **In-Cluster PostgreSQL (as deployed in Kind):**
  - **Feasible:** You can continue deploying PostgreSQL using the Bitnami Helm chart on Autopilot.
  - **Storage:** You'll need to configure `PersistentVolumeClaims` (PVCs). Autopilot supports standard PVCs. Define a `storageClassName` in the PostgreSQL chart's values or use the GKE default (`standard-rwo`). Choose appropriate disk performance (Standard, Balanced, SSD) via the StorageClass or directly in the PVC/values if the chart supports it. Costs will apply based on the provisioned Persistent Disk size and type.
  - **Manageability:** You remain responsible for managing, backing up, and scaling the in-cluster database.
- **Managed Database (Cloud SQL - Recommended for Production):**
  - **Benefits:** Fully managed, automated backups, scaling, high availability options, simplified security.
  - **Action:**
    - Create a Cloud SQL for PostgreSQL instance per tenant (or potentially a shared instance with separate databases, depending on isolation requirements).
    - **Connectivity:** Configure the `backend-api` to connect to Cloud SQL.
      - **Recommended:** Use the **Cloud SQL Auth Proxy** as a sidecar container within the `backend-api` Pod. The application connects to the proxy on `localhost`. This handles secure authentication and encryption without needing IP allowlisting.
      - **Alternative:** Direct connection requires configuring VPC networking (e.g., Private Service Access) and firewall rules.
    - **Helm Chart Changes (`backend-api`):**
      - Modify `deployment.yaml` to include the Cloud SQL Auth Proxy sidecar container.
      - Update `values.yaml` and `deployment.yaml`'s `env` section: Remove internal DB host/port env vars (`DB_HOST`, `DB_PORT`) and potentially adjust `DB_USER`, `DB_NAME`, `DB_PASSWORD` (using Secret Manager for the password is recommended) to match the Cloud SQL instance settings. The application would connect to `127.0.0.1` (the proxy).
      - The Bitnami PostgreSQL Helm chart deployment would no longer be needed for tenants using Cloud SQL.

### 2.3. Ingress and Load Balancing

Kind's port-forwarding or NodePort access is not suitable for production. You need a stable external entry point.

- **Option 1: Traefik + Service Type LoadBalancer (Similar to Kind Setup but with GCP LB):**
  - **Action:**
    - Deploy Traefik to the GKE cluster (using its Helm chart).
    - Configure the Traefik service in its `values.yaml` to be `type: LoadBalancer`.
    - GKE will automatically provision a **Google Cloud Network Load Balancer (L4)** pointing to the Traefik pods.
    - Continue using `IngressRoute` resources as currently configured in the `user-frontend` chart. The Host rules (`app.dir.localhost`, `app.cha.localhost`) will work, but you'll need to configure **external DNS** (e.g., in Cloud DNS or your domain provider) to point these hostnames to the external IP address assigned to the GCP Network Load Balancer.
  - **Cost:** GCP Network Load Balancer costs apply.
- **Option 2: GKE Ingress Controller + HTTP(S) Load Balancer (Recommended for Web Apps):**
  - **Action:**
    - Leverage the **GKE Ingress controller**, which is typically enabled by default.
    - **Remove Traefik:** You wouldn't need to deploy Traefik or use `IngressRoute` resources.
    - **Create `Ingress` Resources:** Modify the Helm charts (likely `user-frontend`) to create standard Kubernetes `Ingress` resources instead of `IngressRoute`.
      - Use annotations like `kubernetes.io/ingress.class: "gce"` (usually default) and potentially `kubernetes.io/ingress.global-static-ip-name` for a static IP.
      - Define backend services, paths (`/api/*`, `/*`), and hosts (`app.dir.localhost`, etc.).
    - GKE will automatically provision a **Google Cloud HTTP(S) Load Balancer (L7)**.
    - Configure **external DNS** to point hostnames to the Load Balancer's IP address.
  - **Benefits:** Native integration, managed SSL certificates (via Google-managed certs or Certificate Manager), potentially better performance features.
  - **Cost:** GCP HTTP(S) Load Balancer costs apply.

### 2.4. Resource Requests and Limits

- **Importance:** While Autopilot manages nodes, `resources.requests` in your `deployment.yaml` (set via `values.yaml`) are **critical**. They determine:
  - How much CPU/memory Autopilot allocates and bills you for.
  - Scheduling decisions.
- **Action:** Review and potentially adjust the `resources.requests` and `limits` in `values.yaml` for `backend-api` and `user-frontend` based on expected load and performance testing. Start with the current values and monitor usage in GKE.
- **Note:** Autopilot enforces minimum requests and specific CPU:Memory ratios. See GKE Autopilot documentation.

### 2.5. IAM and Service Accounts

- **Workload Identity (Recommended):** Use Workload Identity to securely grant GKE workloads (Pods) access to Google Cloud services (like Cloud SQL, Secret Manager, GAR) without using service account keys.
- **Action:**
  - Create Google Cloud Service Accounts (GSA) with necessary IAM roles (e.g., Cloud SQL Client, Secret Manager Secret Accessor, Artifact Registry Reader).
  - Create Kubernetes Service Accounts (KSA) for your applications (`backend-api`, etc. - Helm charts already do this).
  - Configure an IAM policy binding between the GSA and KSA.
  - Annotate the KSA in the Helm chart templates (`serviceAccount.annotations`) to link it to the GSA.

### 2.6. Helm Deployment Command Adjustments

- The `helm install` commands will be similar, but ensure you are:
  - Using the correct image tags pointing to GAR/GCR.
  - Setting appropriate values (`--set`) for:
    - `companyCode`
    - Ingress configuration (`ingressRoute.host` or equivalent if using GKE Ingress)
    - Database connection details (especially if using Cloud SQL)
    - Any other GKE-specific configurations.
  - Targeting the correct GKE cluster context.

## 3. Example GKE Deployment Steps (Conceptual - Using Traefik + L4 LB)

1.  **Configure `gcloud` and `kubectl`** for your GKE cluster.
2.  **Push Images** to Artifact Registry.
3.  **Update `values.yaml`** for all charts to use GAR image paths.
4.  **Deploy Traefik** to GKE with `service.type=LoadBalancer`.
5.  **Get Traefik External IP:** `kubectl get svc traefik -n traefik -o jsonpath='{.status.loadBalancer.ingress[0].ip}'`
6.  **Configure DNS:** Point `app.dir.localhost`, `app.cha.localhost`, etc., to the Traefik external IP.
7.  **Deploy PostgreSQL (per tenant):** `helm install postgresql-dir bitnami/postgresql --namespace dir-tenant --create-namespace ...`
8.  **Deploy Backend API (per tenant):** `helm install backend-api-dir helm/backend-api --namespace dir-tenant --set companyCode=DIR --set image.repository=... --set db.serviceName=postgresql-dir --set db.existingSecret=postgresql-dir ...`
9.  **Deploy User Frontend (per tenant):** `helm install user-frontend-dir helm/user-frontend --namespace dir-tenant --set companyCode=DIR --set image.repository=... --set ingressRoute.enabled=true --set ingressRoute.host=app.dir.localhost --set ingressRoute.backend.serviceName=backend-api-dir ...`
10. **Verify** access via the configured DNS hostnames.

## 4. Cost Considerations

- As discussed previously, use the Google Cloud Pricing Calculator with specific Autopilot resource requests (CPU, memory), Persistent Disk configurations, Load Balancer type, and estimated network traffic for the most accurate cost projection.
- Autopilot's billing model means costs scale directly with the resources your pods request and use.
