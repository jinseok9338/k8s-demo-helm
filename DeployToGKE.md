# Deploying Tenant Dashboard POC to GKE Autopilot

This guide outlines the steps to deploy the Master Backend and Master Frontend applications, along with the necessary infrastructure (like a database for the Master Backend), to a Google Kubernetes Engine (GKE) Autopilot cluster using Helm.

**Assumptions:**

- You have a working application locally (Master Backend, Master Frontend).
- You have Helm charts for the master applications (`helm/master-backend`, `helm/master-frontend`).
- You have Helm charts for tenant-specific deployments (`postgresql`, `backend-api`, `user-frontend`) accessible via Git, as used in the Kind setup. The Master Backend needs access to these charts and permissions to deploy them.
- Basic familiarity with Docker, Kubernetes, Helm, `kubectl`, and `gcloud`.

## Phase 1: Prerequisites and Google Cloud Setup

1.  **Google Cloud Account & Billing:** Ensure you have a Google Cloud account with billing enabled.
2.  **Install Tools:** Make sure `gcloud`, `kubectl`, `helm`, and `docker` are installed locally.
3.  **Set Project:** Configure `gcloud` to use your target project.
    ```bash
    gcloud config set project YOUR_PROJECT_ID
    ```
4.  **Enable APIs:** Enable necessary Google Cloud APIs.
    ```bash
    gcloud services enable \\
        container.googleapis.com \\
        sqladmin.googleapis.com \\
        artifactregistry.googleapis.com \\
        iamcredentials.googleapis.com \\
        cloudresourcemanager.googleapis.com # Needed for IAM bindings
    ```

## Phase 2: Infrastructure Setup

1.  **Database Setup (Cloud SQL for Master Backend):**

    - The Master Backend requires its own database. Cloud SQL (PostgreSQL) is recommended.
    - Create a Cloud SQL PostgreSQL instance:

      ```bash
      # Choose a strong password for the 'postgres' user (or create a dedicated user later)
      DB_PASSWORD="CHOOSE_A_STRONG_PASSWORD"

      gcloud sql instances create master-backend-db \\
          --database-version=POSTGRES_15 \\
          --cpu=1 \\
          --memory=4GiB \\
          --region=YOUR_REGION \\
          --root-password="${DB_PASSWORD}" \\
          --assign-ip=PRIVATE \\
          --network=YOUR_VPC_NETWORK # Specify the VPC network GKE will use
      ```

    - **Important:** Note the **Connection name** (`YOUR_PROJECT_ID:YOUR_REGION:master-backend-db`), the **Private IP address**, and the chosen **password**.
    - Create a database specifically for the Master Backend (e.g., `master_db`) using the Cloud Console or `gcloud`:
      ```bash
      # Example using gcloud sql databases create
      gcloud sql databases create master_db --instance=master-backend-db
      # Example using gcloud sql users create (if you want a dedicated user)
      # gcloud sql users create master_user --instance=master-backend-db --password=ANOTHER_STRONG_PASSWORD
      ```
    - Record the username (default `postgres` or your dedicated user), password, database name (`master_db`), and the Private IP address.

2.  **GKE Autopilot Cluster:**

    - Create an Autopilot cluster in the same VPC network as the Cloud SQL instance:
      ```bash
      gcloud container clusters create-auto master-dashboard-cluster \\
          --region=YOUR_REGION \\
          --network=YOUR_VPC_NETWORK \\
          --subnetwork=YOUR_VPC_SUBNET # Ensure cluster nodes can reach the Private IP
      ```
    - Get cluster credentials:
      ```bash
      gcloud container clusters get-credentials master-dashboard-cluster --region=YOUR_REGION
      ```
    - Verify connection: `kubectl get nodes`

3.  **Artifact Registry (Docker Repository):**
    - Create a Docker repository in Artifact Registry:
      ```bash
      gcloud artifacts repositories create master-apps-repo \\
          --repository-format=docker \\
          --location=YOUR_REGION \\
          --description="Docker repository for Master Dashboard apps"
      ```
    - Configure Docker to authenticate with Artifact Registry:
      ```bash
      gcloud auth configure-docker YOUR_REGION-docker.pkg.dev
      ```

## Phase 3: Application Containerization & Push

1.  **Dockerfile:** Ensure your `Dockerfile`s for `master-backend` (including `git`, `helm`, `kubectl`) and `master-frontend` (multi-stage with Nginx) are up-to-date based on the previous steps.
2.  **Build Images:** Navigate to each application directory and build the Docker images, tagging them for Artifact Registry. Use the latest working tags identified in the Kind setup (e.g., `0.1.7` for backend, `0.1.1` for frontend). Replace `YOUR_REGION` and `YOUR_PROJECT_ID`.

    ```bash
    # In applications/master-backend
    docker build -t YOUR_REGION-docker.pkg.dev/YOUR_PROJECT_ID/master-apps-repo/master-backend:0.1.7 .

    # In applications/master-frontend
    docker build -t YOUR_REGION-docker.pkg.dev/YOUR_PROJECT_ID/master-apps-repo/master-frontend:0.1.1 .
    ```

3.  **Push Images:** Push the built images to Artifact Registry.
    ```bash
    docker push YOUR_REGION-docker.pkg.dev/YOUR_PROJECT_ID/master-apps-repo/master-backend:0.1.7
    docker push YOUR_REGION-docker.pkg.dev/YOUR_PROJECT_ID/master-apps-repo/master-frontend:0.1.1
    ```

## Phase 4: Helm Configuration & Deployment on GKE

This phase uses the Helm charts (`helm/master-backend` and `helm/master-frontend`) to deploy the applications to the GKE cluster. We will leverage Workload Identity for secure access to Google Cloud services (like Cloud SQL) and the GKE API.

1.  **Namespace:** Create the namespace where the master applications will reside.

    ```bash
    kubectl create ns master
    ```

2.  **Database Secret:** Create a Kubernetes secret in the `master` namespace to store the Cloud SQL database connection URL.

    - Gather the Cloud SQL details recorded in Phase 2:
      - Username (e.g., `postgres` or your dedicated user)
      - Password
      - Database name (e.g., `master_db`)
      - **Private IP Address**
    - Construct the `DATABASE_URL` string:
      `postgresql://<DB_USER>:<DB_PASSWORD>@<DB_HOST_PRIVATE_IP>:5432/<DB_NAME>`
    - Create the secret using the constructed URL (replace placeholders with your actual values):

      ```bash
      # Replace placeholders with your actual Cloud SQL credentials and Private IP
      DB_USER="your_db_user" # e.g., postgres
      DB_PASSWORD="your_db_password"
      DB_HOST_PRIVATE_IP="your_cloudsql_private_ip"
      DB_NAME="master_db" # Or your chosen DB name

      DB_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST_PRIVATE_IP}:5432/${DB_NAME}"

      kubectl create secret generic master-db-secret \\
        --from-literal=DATABASE_URL="$DB_URL" \\
        --namespace master
      ```

    - **Note:** Using the Cloud SQL Auth Proxy is an alternative approach that avoids exposing the database private IP directly in the URL. It involves configuring a sidecar container in the `master-backend` deployment (via Helm values) and potentially using IAM database authentication. This guide uses the Private IP method for simplicity.

3.  **Workload Identity & IAM Configuration:** Configure Workload Identity to allow the `master-backend` Kubernetes Service Account (KSA) to securely impersonate a Google Cloud Service Account (GSA). This GSA needs permissions to access Cloud SQL and manage Kubernetes resources for tenant deployments.

    - **Create Google Cloud Service Account (GSA):**

      ```bash
      gcloud iam service-accounts create master-backend-sa \\
          --project=YOUR_PROJECT_ID \\
          --display-name="Master Backend GKE Service Account"
      ```

    - **Grant IAM Roles to GSA:** Assign necessary roles to the GSA. **These roles grant permissions at the Google Cloud level.**

      ```bash
      # Replace YOUR_PROJECT_ID with your actual project ID
      GSA_EMAIL="master-backend-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com"

      # Allow connection to Cloud SQL instances (required for DB access via Private IP/Proxy)
      gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \\
          --member="serviceAccount:${GSA_EMAIL}" \
          --role="roles/cloudsql.client"

      # Allow basic interaction with GKE API (needed by Helm/kubectl from within the pod)
      gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
          --member="serviceAccount:${GSA_EMAIL}" \
          --role="roles/container.developer"

      # === Permissions for Tenant Management ===
      # Grant permissions for the Master Backend to manage tenant resources
      # (e.g., create namespaces, deploy Helm charts for tenants).
      # 'roles/container.admin' is broad but often sufficient for non-production setups.
      # WARNING: For production, create a custom IAM role with more granular permissions (e.g., limited to creating specific resources in specific namespaces).
      gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
          --member="serviceAccount:${GSA_EMAIL}" \
          --role="roles/container.admin" # Review permissions for production!
      ```

    - **Prepare Helm Values for GKE:** Create GKE-specific value files or prepare `--set` arguments for the Helm deployments. Modify your existing `helm/*/values.yaml` or create new files like `values-gke.yaml`.

      - **`helm/master-backend/values.yaml` (or `values-gke.yaml`):**
        Ensure these values are set:

      ```yaml
      image:
        repository: YOUR_REGION-docker.pkg.dev/YOUR_PROJECT_ID/master-apps-repo/master-backend # Replace with your Artifact Registry path
        tag: 0.1.7 # Use the tag pushed to Artifact Registry
        pullPolicy: IfNotPresent

      serviceAccount:
        create: true # Let Helm create the KSA
        # Add annotation to link KSA to GSA for Workload Identity
        annotations:
          # Replace YOUR_PROJECT_ID with your actual project ID
        iam.gke.io/gcp-service-account: master-backend-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com

      # If your chart has logic to create a DB secret, disable it
      secret:
        create: false

      config:
        # Tell the deployment template how to find the DATABASE_URL
        # Option 1: If template directly uses config.database.secretName/secretKey
        database:
          secretName: master-db-secret # Name of the secret created above
          secretKey: DATABASE_URL # Key within the secret
          url: "" # Ensure template doesn't use this if secretName is set
        # Option 2: If template expects the secret name in a specific env var
        # database:
        #   existingSecret: master-db-secret # Reference the secret

        port: 3001 # Ensure this matches the application port

      # RBAC should be enabled for tenant management (in-cluster permissions)
      rbac:
        create: true
      ```

      **Important:** Verify your `helm/master-backend/templates/deployment.yaml`. Ensure the `DATABASE_URL` environment variable for the backend container is populated correctly using the `master-db-secret`. It should look something like this:

    ````yaml
        env:
          - name: DATABASE_URL
                  valueFrom:
                    secretKeyRef:
                # Reference the secret name from values.yaml
                name:
                  {
                    {
                      .Values.config.database.secretName | default "master-db-secret",
                    },
                  }
                key:
                  {{.Values.config.database.secretKey | default "DATABASE_URL"}}
          # Add other necessary environment variables (e.g., PORT)
          - name: PORT
            value: {{.Values.config.port | quote}}
        ```

      - **`helm/master-frontend/values.yaml` (or `values-gke.yaml`):**
        Ensure these values are set:

    ```yaml
        image:
          repository: YOUR_REGION-docker.pkg.dev/YOUR_PROJECT_ID/master-apps-repo/master-frontend # Replace with your Artifact Registry path
          tag: 0.1.1 # Use the tag pushed to Artifact Registry
          pullPolicy: IfNotPresent

        ingress:
          enabled: true
          className: "" # Use default GKE ingress class, or specify if needed (e.g., "gce")
          # annotations:
          # Add GKE specific annotations if needed
          # Example for Google-managed Static IP:
          # kubernetes.io/ingress.global-static-ip-name: "your-static-ip-name"
          # Example for Google-managed Certificate:
          # networking.gke.io/managed-certificates: "your-managed-cert-name"
          # frontendconfig.networking.gke.io/v1beta1: your-frontend-config # For HTTPS redirects, security policy etc.
          hosts:
            - host: master.your-domain.com # !!! CHANGE to your actual desired hostname !!!
              paths:
                - path: /
                  pathType: ImplementationSpecific # Or Prefix if needed
                  backend:
                    service:
                      # name: uses chart helpers -> master-frontend-release
                      port:
                        name: http # Match frontend service port name (usually 'http' or 80)
                - path: /api(/.*)? # Route API calls to backend (added optional group)
                  pathType: Prefix # Use Prefix for /api/*
                  backend:
                    service:
                      # Use overrides to point to the master-backend service
                      # Ensure these match the release name and chart structure of master-backend
                      name:
                        {
                          {
                            printf "%s-%s" .Values.backend.releaseNameOverride .Values.backend.chartNameOverride | trunc 63 | trimSuffix "-",
                          },
                        }
                      port:
                        name: http # Match backend service port name ('http' maps to 3001 based on backend chart)

        # Configure how frontend ingress finds the backend service
        backend:
          releaseNameOverride: master-backend-release # Assumed release name for backend
          chartNameOverride: master-backend # Assumed chart name for backend (often matches directory name)
        ```

    ````

4.  **Deploy Master Backend with Helm:** Deploy the chart using the configured values.

    ```bash
    # Use -f if you created values-gke.yaml, otherwise ensure values.yaml is updated
    helm upgrade --install master-backend-release ./helm/master-backend \
      --namespace master \
      --create-namespace \
      -f helm/master-backend/values.yaml \
      --wait
    ```

    - **Wait for the pod to be running:** `kubectl get pods -n master -l app.kubernetes.io/instance=master-backend-release -w`

5.  **Bind GSA to KSA:** Now that Helm has created the KSA (named after the release, e.g., `master-backend-release`), bind the GSA to it to enable Workload Identity.

    ```bash
    # Replace YOUR_PROJECT_ID
    GSA_EMAIL="master-backend-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com"
    # This should match the Helm release name used above
    KSA_NAME="master-backend-release"
    K8S_NAMESPACE="master"

    gcloud iam service-accounts add-iam-policy-binding "${GSA_EMAIL}" \
        --role="roles/iam.workloadIdentityUser" \
        --member="serviceAccount:YOUR_PROJECT_ID.svc.id.goog[${K8S_NAMESPACE}/${KSA_NAME}]" \
        --project=YOUR_PROJECT_ID
    ```

    - **Important:** The `master-backend` pod needs to use this binding. If the pod started before the binding was applied, restart the deployment to ensure the pod picks up the Workload Identity configuration:
      ```bash
      kubectl rollout restart deployment/master-backend-release -n master
      ```
    - Verify the pod restarts successfully: `kubectl get pods -n master -l app.kubernetes.io/instance=master-backend-release -w`

6.  **Deploy Master Frontend with Helm:** Deploy the frontend chart.
    ```bash
    # Use -f if you created values-gke.yaml
    helm upgrade --install master-frontend-release ./helm/master-frontend \
      --namespace master \
      -f helm/master-frontend/values.yaml \
      --wait
    ```

## Phase 5: Accessing the Application

1.  **Get Ingress IP:** Wait a few minutes for GKE to provision an external IP address for the `master-frontend-release` Ingress resource.
    ```bash
    kubectl get ingress master-frontend-release -n master -w
    # Wait until the ADDRESS field shows an external IP address. Copy this IP.
    ```
2.  **Configure DNS:** Go to your DNS provider's console and create an `A` record pointing the hostname you configured in `helm/master-frontend/values.yaml` (e.g., `master.your-domain.com`) to the external IP address obtained above.
3.  **Access:** Allow some time for DNS propagation. Then, open your browser and navigate to `http://master.your-domain.com` (or `https://` if you configured TLS, e.g., via Google-managed certificates in the Ingress annotations). You should see the Master Frontend dashboard. API calls (`/api/*`) should be routed to the Master Backend service.

## Phase 6: Tenant Deployment Considerations on GKE

Deploying tenants via the `master-backend` API (e.g., POST `/api/tenants/:companyCode/deploy`) uses the logic built into the `master-backend` application (cloning Git repos, running Helm). Consider these GKE specifics:

- **Git Authentication:** If your tenant Helm charts are stored in **private** Git repositories, the `master-backend` pod needs credentials. Since it runs as the GSA via Workload Identity, you have options:
  - **SSH Keys:** Create a Kubernetes secret containing the private SSH key, mount it into the `master-backend` pod (configure via Helm `values.yaml` `extraVolumes` and `extraVolumeMounts`), and configure Git within the container to use it.
  - **Cloud Source Repositories:** If using Google Cloud Source Repositories, grant the `master-backend-sa` GSA the `roles/source.reader` IAM role on the specific repository. The pod should then be able to clone using the Workload Identity credentials.
  - **Other Providers (GitHub/GitLab etc.):** Use HTTPS access tokens or deploy keys. Store the token/key securely in a Kubernetes secret (like `master-git-creds`) and mount it into the pod. Modify the `git clone` command in the backend code to use the token (e.g., `https://<token>@github.com/...`).
- **IAM Permissions (GSA):** The tenant deployment process involves creating Kubernetes resources (Namespaces, Deployments, Services, Secrets, etc.) possibly in new namespaces. Double-check that the GCP IAM roles granted to the `master-backend-sa` GSA (in Phase 4, Step 3) are sufficient for all these actions performed via the GKE API. The `roles/container.admin` role is broad; **refine this to least privilege for production environments** by creating a custom IAM role. Remember, the pod uses both the GSA's Cloud IAM permissions _and_ its in-cluster Kubernetes RBAC (`ClusterRole` defined in the Helm chart) - both need to allow the required actions.
- **Network Policies:** If you have GKE Network Policies enabled in your cluster or configured for the `master` namespace, ensure they allow:
  - Egress traffic from the `master-backend` pod to your Git repository host (e.g., `github.com`, `gitlab.com`) on port 443 (HTTPS) or 22 (SSH).
  - Egress traffic from the `master-backend` pod to the Kubernetes API server (`kubernetes.default.svc`) on port 443.
  - Necessary ingress/egress for the deployed tenant applications within their own namespaces, and potentially communication between tenant pods and the `master-backend` if needed.
- **Cloud SQL for Tenants:** By default, the tenant `postgresql` Helm chart (if using the Bitnami one) deploys a PostgreSQL instance _within_ the Kubernetes cluster (as a StatefulSet). If tenants required their _own dedicated Cloud SQL instances_, the `master-backend` application logic and the GSA's IAM permissions would need significant changes (e.g., adding `roles/cloudsql.admin` to the GSA, modifying the backend code to call Cloud SQL Admin API, and heavily modifying the tenant Helm charts).

## Phase 7: Cleanup (Optional)

To delete the deployed resources:

1.  **Delete Helm Releases:**
    ```bash
    helm delete master-frontend-release -n master
    helm delete master-backend-release -n master
    ```
2.  **Delete Namespace:**
    ```bash
    kubectl delete ns master
    ```
3.  **Delete GKE Cluster:**
    ```bash
    gcloud container clusters delete master-dashboard-cluster --region=YOUR_REGION
    ```
4.  **Delete Cloud SQL Instance:**
    ```bash
    gcloud sql instances delete master-backend-db
    ```
5.  **Delete Artifact Registry Repository:**
    ```bash
    gcloud artifacts repositories delete master-apps-repo --location=YOUR_REGION
    ```
6.  **Delete GSA:**
    ```bash
    gcloud iam service-accounts delete master-backend-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com
    ```
7.  **Remove IAM Bindings:** Review and remove the IAM bindings added for the GSA if not needed elsewhere.
8.  **Delete DNS Record:** Remove the DNS record created for `master.your-domain.com`.
