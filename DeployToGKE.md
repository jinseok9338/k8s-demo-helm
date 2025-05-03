# Deploying Tenant Dashboard POC to GKE Autopilot

This guide outlines the steps to deploy the Master Backend and Master Frontend applications, along with the necessary infrastructure (like a database for the Master Backend), to a Google Kubernetes Engine (GKE) Autopilot cluster.

**Assumptions:**

- You have a working application locally (Master Backend, Master Frontend).
- You have Helm charts for tenant-specific deployments (`postgresql`, `backend-api`, `user-frontend`) as referenced in `day3.md` and `HelmChartLearningGuide.md`. The Master Backend needs access to these charts and permissions to deploy them.
- Basic familiarity with Docker, Kubernetes, `kubectl`, and `gcloud`.

## Phase 1: Prerequisites and Google Cloud Setup

1.  **Google Cloud Account & Billing:** Ensure you have a Google Cloud account with billing enabled. Refer to `prequisite.md`.
2.  **Install Tools:** Make sure `gcloud`, `kubectl`, and `docker` are installed locally. Refer to `prequisite.md`.
3.  **Set Project:** Configure `gcloud` to use your target project.
    ```bash
    gcloud config set project YOUR_PROJECT_ID
    ```
4.  **Enable APIs:** Enable necessary Google Cloud APIs.
    ```bash
    gcloud services enable \
        container.googleapis.com \
        sqladmin.googleapis.com \
        artifactregistry.googleapis.com \
        iamcredentials.googleapis.com \
        cloudresourcemanager.googleapis.com # Needed for IAM bindings
    ```

## Phase 2: Infrastructure Setup

1.  **Database Setup (Cloud SQL for Master Backend):**

    - The Master Backend requires its own database (distinct from the tenant databases). Cloud SQL (PostgreSQL) is recommended.
    - Create a Cloud SQL PostgreSQL instance:
      ```bash
      gcloud sql instances create master-backend-db \
          --database-version=POSTGRES_15 \
          --cpu=1 \
          --memory=4GiB \
          --region=YOUR_REGION \
          --root-password=CHOOSE_A_STRONG_PASSWORD
      # Autopilot best practice: Use Private IP + Cloud SQL Proxy sidecar or Direct VPC egress
      # Add --assign-ip=PRIVATE for private IP
      ```
    - **Important:** Note the **Connection name** (`YOUR_PROJECT_ID:YOUR_REGION:master-backend-db`) and the **Private IP address** if using private IP.
    - Create a database user and a database specifically for the Master Backend using the Cloud Console or `gcloud sql users create` / `gcloud sql databases create`.

2.  **GKE Autopilot Cluster:**

    - Create an Autopilot cluster:
      ```bash
      gcloud container clusters create-auto master-dashboard-cluster \
          --region=YOUR_REGION
          # Add --network=YOUR_VPC_NETWORK --subnetwork=YOUR_VPC_SUBNET if using Private Cloud SQL
      ```
    - Get cluster credentials:
      ```bash
      gcloud container clusters get-credentials master-dashboard-cluster --region=YOUR_REGION
      ```
    - Verify connection: `kubectl get nodes`

3.  **Artifact Registry (Docker Repository):**
    - Create a Docker repository in Artifact Registry:
      ```bash
      gcloud artifacts repositories create master-apps-repo \
          --repository-format=docker \
          --location=YOUR_REGION \
          --description="Docker repository for Master Dashboard apps"
      ```
    - Configure Docker to authenticate with Artifact Registry:
      ```bash
      gcloud auth configure-docker YOUR_REGION-docker.pkg.dev
      ```

## Phase 3: Application Containerization & Push

1.  **Dockerfile:** Ensure you have functional `Dockerfile`s for both `master-backend` and `master-frontend`.
    - `master-backend`: Needs Node.js, potentially `helm` and `kubectl` CLI tools installed (or configure access differently), copies application code, installs dependencies, exposes the correct port (e.g., 3001), defines the `CMD`.
    - `master-frontend`: Needs Node.js for building, uses a multi-stage build with a static web server (like Nginx) to serve the built files, exposes the web server port (e.g., 80).
2.  **Build Images:** Navigate to each application directory and build the Docker images, tagging them for Artifact Registry.

    ```bash
    # In applications/master-backend
    docker build -t YOUR_REGION-docker.pkg.dev/YOUR_PROJECT_ID/master-apps-repo/master-backend:v1 .

    # In applications/master-frontend
    docker build -t YOUR_REGION-docker.pkg.dev/YOUR_PROJECT_ID/master-apps-repo/master-frontend:v1 .
    ```

3.  **Push Images:** Push the built images to Artifact Registry.
    ```bash
    docker push YOUR_REGION-docker.pkg.dev/YOUR_PROJECT_ID/master-apps-repo/master-backend:v1
    docker push YOUR_REGION-docker.pkg.dev/YOUR_PROJECT_ID/master-apps-repo/master-frontend:v1
    ```

## Phase 4: Kubernetes Configuration & Deployment

Create the following Kubernetes manifest files (e.g., in a `k8s/` directory).

1.  **Namespace:** (`k8s/namespace.yaml`)

    ```yaml
    apiVersion: v1
    kind: Namespace
    metadata:
      name: master-dashboard-ns
    ```

2.  **Database Secret:** (`k8s/master-db-secret.yaml`)

    - Create a secret to hold Cloud SQL credentials securely. Get values after creating the DB user/database. **Encode values in Base64**.

    ```yaml
    apiVersion: v1
    kind: Secret
    metadata:
      name: master-db-secret
      namespace: master-dashboard-ns
    type: Opaque
    data:
      DB_USER: # base64 encoded username
      DB_PASSWORD: # base64 encoded password
      DB_NAME: # base64 encoded database name
      DB_HOST: # base64 encoded Cloud SQL Private IP or 127.0.0.1 if using proxy
      # Or for Cloud SQL Proxy sidecar (preferred for Autopilot):
      # INSTANCE_CONNECTION_NAME: # base64 encoded YOUR_PROJECT_ID:YOUR_REGION:master-backend-db
    ```

    - Apply: `kubectl apply -f k8s/master-db-secret.yaml`

3.  **Workload Identity & Service Account Permissions:**

    - Configure Workload Identity to allow the Master Backend Kubernetes Service Account (KSA) to act as a Google Cloud IAM Service Account (GSA) without keys. This GSA needs permissions to:
      - Manage GKE resources (create namespaces, deploy Helm charts - requires specific roles like `roles/container.developer` or more granular ones).
      - Connect to Cloud SQL (if using proxy/IAM auth).
    - **Create GSA:**
      ```bash
      gcloud iam service-accounts create master-backend-sa \
          --display-name="Master Backend GKE Service Account"
      ```
    - **Grant GSA IAM Roles:** Grant _necessary_ roles to the GSA (Example: GKE interaction, Cloud SQL client). **Be specific - avoid overly broad permissions.**

      ```bash
      # Example: Basic GKE interaction (adjust roles based on Helm needs!)
      gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
          --member="serviceAccount:master-backend-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
          --role="roles/container.developer" # Might need more for Helm/NS creation

      # Example: Cloud SQL Client (needed for Proxy connection)
      gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
          --member="serviceAccount:master-backend-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
          --role="roles/cloudsql.client"
      ```

    - **Create KSA:** (`k8s/master-backend-ksa.yaml`)
      ```yaml
      apiVersion: v1
      kind: ServiceAccount
      metadata:
        name: master-backend-ksa
        namespace: master-dashboard-ns
      ```
      Apply: `kubectl apply -f k8s/master-backend-ksa.yaml`
    - **Allow KSA to impersonate GSA:**
      ```bash
      gcloud iam service-accounts add-iam-policy-binding master-backend-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com \
          --role="roles/iam.workloadIdentityUser" \
          --member="serviceAccount:YOUR_PROJECT_ID.svc.id.goog[master-dashboard-ns/master-backend-ksa]"
      ```
    - **Annotate KSA:** (`k8s/master-backend-ksa.yaml` - _modify existing file_)
      ```yaml
      apiVersion: v1
      kind: ServiceAccount
      metadata:
        name: master-backend-ksa
        namespace: master-dashboard-ns
        annotations: # Add this annotation
          iam.gke.io/gcp-service-account: master-backend-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com
      ```
      Apply again: `kubectl apply -f k8s/master-backend-ksa.yaml`

4.  **Master Backend Deployment:** (`k8s/master-backend-deployment.yaml`)

    ```yaml
    apiVersion: apps/v1
    kind: Deployment
    metadata:
      name: master-backend
      namespace: master-dashboard-ns
      labels:
        app: master-backend
    spec:
      replicas: 1 # Start with 1, Autopilot can scale
      selector:
        matchLabels:
          app: master-backend
      template:
        metadata:
          labels:
            app: master-backend
        spec:
          serviceAccountName: master-backend-ksa # Use the KSA configured for Workload Identity
          containers:
            - name: backend
              image: YOUR_REGION-docker.pkg.dev/YOUR_PROJECT_ID/master-apps-repo/master-backend:v1
              ports:
                - containerPort: 3001 # Match the port your app listens on
              env:
                - name: NODE_ENV
                  value: "production"
                - name: PORT
                  value: "3001"
                - name: DATABASE_URL # Construct from secret values
                  valueFrom:
                    secretKeyRef:
                      name: master-db-secret
                      key: # Depending on how you stored it: DB_HOST or use INSTANCE_CONNECTION_NAME with proxy
                # Add other env vars from secret (DB_USER, DB_PASSWORD, DB_NAME)
                - name: DB_USER
                  valueFrom:
                    {secretKeyRef: {name: master-db-secret, key: DB_USER}}
              # ... add others
              # Ensure KUBECONFIG is NOT set, rely on in-cluster config or Workload Identity
    ```

5.  **Master Backend Service:** (`k8s/master-backend-service.yaml`)

    ```yaml
    apiVersion: v1
    kind: Service
    metadata:
      name: master-backend-service
      namespace: master-dashboard-ns
    spec:
      selector:
        app: master-backend
      ports:
        - protocol: TCP
          port: 80 # Service port
          targetPort: 3001 # Port the backend container listens on
      type: ClusterIP # Internal service
    ```

6.  **Master Frontend Deployment:** (`k8s/master-frontend-deployment.yaml`)

    ```yaml
    apiVersion: apps/v1
    kind: Deployment
    metadata:
      name: master-frontend
      namespace: master-dashboard-ns
      labels:
        app: master-frontend
    spec:
      replicas: 1
      selector:
        matchLabels:
          app: master-frontend
      template:
        metadata:
          labels:
            app: master-frontend
        spec:
          containers:
            - name: frontend
              image: YOUR_REGION-docker.pkg.dev/YOUR_PROJECT_ID/master-apps-repo/master-frontend:v1
              ports:
                - containerPort: 80 # Match Nginx/webserver port in the image
              env:
                - name: VITE_BACKEND_API_URL
                  # Point to the internal backend service DNS name
                  value: "http://master-backend-service.master-dashboard-ns.svc.cluster.local:80/api" # Adjust port if service uses different one
    ```

7.  **Master Frontend Service:** (`k8s/master-frontend-service.yaml`)

    ```yaml
    apiVersion: v1
    kind: Service
    metadata:
      name: master-frontend-service
      namespace: master-dashboard-ns
    spec:
      selector:
        app: master-frontend
      ports:
        - protocol: TCP
          port: 80 # Service port matches container port
          targetPort: 80
      type: ClusterIP
    ```

8.  **Ingress:** (`k8s/ingress.yaml`) - Exposes the frontend to the internet.
    ```yaml
    apiVersion: networking.k8s.io/v1
    kind: Ingress
    metadata:
      name: master-dashboard-ingress
      namespace: master-dashboard-ns
      annotations:
        # Use GKE managed certs for HTTPS (optional but recommended)
        # networking.gke.io/managed-certificates: managed-cert-name
        # kubernetes.io/ingress.class: "gce" # Usually default on GKE
    spec:
      # defaultBackend: # Optional: define a default backend if needed
      rules:
        - http:
            paths:
              - path: /* # Route all traffic
                pathType: ImplementationSpecific
                backend:
                  service:
                    name: master-frontend-service
                    port:
                      number: 80
    # Define managed-cert-name resource if using Google-managed TLS
    ```

## Phase 5: Deployment and Verification

1.  **Apply Manifests:**

    ```bash
    kubectl apply -f k8s/namespace.yaml
    # Secret already applied
    kubectl apply -f k8s/master-backend-ksa.yaml # Apply annotated KSA
    kubectl apply -f k8s/master-backend-deployment.yaml
    kubectl apply -f k8s/master-backend-service.yaml
    kubectl apply -f k8s/master-frontend-deployment.yaml
    kubectl apply -f k8s/master-frontend-service.yaml
    kubectl apply -f k8s/ingress.yaml
    ```

2.  **Check Status:**

    ```bash
    kubectl get pods,svc,ingress -n master-dashboard-ns
    # Wait for pods to be Running and Ingress to get an IP address
    ```

3.  **Check Logs:**

    ```bash
    kubectl logs -l app=master-backend -n master-dashboard-ns -f
    kubectl logs -l app=master-frontend -n master-dashboard-ns -f
    ```

4.  **Access Application:** Find the Ingress IP address (`kubectl get ingress -n master-dashboard-ns`) and access it in your browser.

5.  **Verify Tenant Creation:** Test creating/managing tenants via the UI. Check the Master Backend logs to ensure it can execute `helm`/`kubectl` commands using its service account permissions. Troubleshoot RBAC roles if tenant creation fails due to permissions.

## Phase 6: Final Configuration & Considerations

- **Environment Variables:** Double-check all environment variables in the Deployments (`DATABASE_URL`, `VITE_BACKEND_API_URL`, etc.) are correctly set for the GKE environment.
- **Master Backend Permissions:** The permissions granted to `master-backend-sa` are critical. Ensure it has _exactly_ the permissions needed to manage tenant resources (create/delete namespaces, deploy/delete Helm releases, scale deployments) and no more. This might require creating custom IAM roles or using more granular GKE roles.
- **Helm/Kubectl in Backend:** Ensure the `master-backend` container image includes `helm` and `kubectl` or that the backend code is configured to use the in-cluster service account correctly with the Kubernetes client library.
- **Cloud SQL Proxy:** If using private IP for Cloud SQL, the recommended approach is to run the [Cloud SQL Auth Proxy](https://cloud.google.com/sql/docs/postgres/connect-auth-proxy) as a sidecar container in the `master-backend` deployment pod. The backend would then connect to `127.0.0.1`.
- **Security:** Review firewall rules, IAM permissions, and secret management.
- **Monitoring & Logging:** Configure Cloud Monitoring and Cloud Logging for the GKE cluster and applications.
- **CI/CD:** Set up a CI/CD pipeline (e.g., using Cloud Build, GitHub Actions) to automate image builds and deployments.
