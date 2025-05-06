#!/bin/bash

# This script handles GSA creation, IAM binding, and Helm deployment for both master applications.
# It assumes the namespace and DB secret are already created (e.g., by 7-PrepareGKENamespaceAndSecret.sh)
# and that values-gke.yaml files are correctly populated.

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Configuration --- 
# Replace with your actual Project ID and Region
PROJECT_ID="nth-circlet-458901-h9"
REGION="asia-northeast3"
# Service Accounts and Helm Release Names
GSA_NAME="master-backend-sa"
GSA_EMAIL="$GSA_NAME@$PROJECT_ID.iam.gserviceaccount.com"
NAMESPACE="master"
# Helm creates KSA named after release if serviceAccount.create=true and name is not set
# Ensure this matches the intended KSA name used by the Pods.
KSA_NAME="master-backend-release" 
HELM_RELEASE_BACKEND="master-backend-release"
HELM_RELEASE_FRONTEND="master-frontend-release"
# ---------------------

# Check if values-gke.yaml files exist
if [ ! -f "helm/master-backend/values-gke.yaml" ] || [ ! -f "helm/master-frontend/values-gke.yaml" ]; then
    echo "Error: helm/*/values-gke.yaml file(s) not found." 
    echo "Please ensure these files exist and are correctly populated with your GKE settings (image paths, WI annotation, ingress host etc.)."
    exit 1
fi

echo "--- Step 1: Create Google Cloud Service Account (GSA) --- "
# Check if GSA already exists
GSA_EXISTS=$(gcloud iam service-accounts list --project=$PROJECT_ID --filter="email=$GSA_EMAIL" --format="value(email)")
if [ -z "$GSA_EXISTS" ]; then
    echo "Creating GSA: $GSA_NAME..."
    gcloud iam service-accounts create $GSA_NAME \
        --project=$PROJECT_ID \
        --display-name="Master Backend GKE Service Account"
    echo "GSA '$GSA_NAME' created."
else
    echo "GSA '$GSA_NAME' ($GSA_EMAIL) already exists."
fi

echo "\n--- Step 2: Grant IAM Roles to GSA --- "
ROLES_TO_GRANT=(
    "roles/cloudsql.client"         # Allow connection to Cloud SQL
    "roles/container.developer"     # Basic permissions for K8s resources (deployments, services etc.)
    "roles/container.admin"         # WARNING: Broad permissions, needed for namespace/CRD management by backend. Use granular roles in production.
    "roles/artifactregistry.reader" # Allow pulling images from Artifact Registry (RESTORED)
)

for ROLE in "${ROLES_TO_GRANT[@]}"; do
    echo "Checking/Binding role $ROLE to GSA $GSA_EMAIL..."
    # Check if binding already exists to avoid errors/noise
    BINDING_EXISTS=$(gcloud projects get-iam-policy $PROJECT_ID --flatten="bindings[].members" --format='value(bindings.role)' --filter="bindings.role=$ROLE AND bindings.members=serviceAccount:$GSA_EMAIL")
    if [ -z "$BINDING_EXISTS" ]; then
        echo "Binding role $ROLE..."
        gcloud projects add-iam-policy-binding $PROJECT_ID \
            --member="serviceAccount:$GSA_EMAIL" \
            --role="$ROLE" \
            --condition=None # Required for no condition
        echo "Role $ROLE bound."
    else
        echo "Role $ROLE already bound."
    fi
done

echo "\n--- Step 3a: Ensure Namespace Exists --- "
echo "Ensuring namespace '$NAMESPACE' exists..."
kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

echo "\n--- Step 3b: Deploy Master Backend with Helm --- "
CHART_PATH_BACKEND="./helm/master-backend"
echo "Deploying/Updating $HELM_RELEASE_BACKEND in namespace $NAMESPACE..."

helm upgrade --install $HELM_RELEASE_BACKEND $CHART_PATH_BACKEND \
  --namespace $NAMESPACE \
  -f helm/master-backend/values.yaml \
  -f helm/master-backend/values-gke.yaml \
  --wait

echo "Deployment of $HELM_RELEASE_BACKEND completed. Waiting briefly for KSA propagation..."
sleep 10 # Brief pause to allow KSA to be fully created/recognized

echo "\n--- Step 4: Bind GSA to Kubernetes Service Account (KSA) --- "
# Verify KSA name aligns with Helm chart (serviceAccount.name or release name)
# Check if KSA exists before attempting to bind
if kubectl get serviceaccount $KSA_NAME --namespace $NAMESPACE > /dev/null 2>&1; then
    echo "Binding GSA ($GSA_EMAIL) to KSA ($NAMESPACE/$KSA_NAME)..."
    # Check if WI binding already exists
    WI_BINDING_EXISTS=$(gcloud iam service-accounts get-iam-policy "$GSA_EMAIL" --project=$PROJECT_ID --flatten="bindings[].members" --format='value(bindings.role)' --filter="bindings.role=roles/iam.workloadIdentityUser AND bindings.members=serviceAccount:$PROJECT_ID.svc.id.goog[$NAMESPACE/$KSA_NAME]")
    if [ -z "$WI_BINDING_EXISTS" ]; then
        echo "Adding Workload Identity User role binding..."
        gcloud iam service-accounts add-iam-policy-binding "$GSA_EMAIL" \
            --role="roles/iam.workloadIdentityUser" \
            --member="serviceAccount:$PROJECT_ID.svc.id.goog[$NAMESPACE/$KSA_NAME]" \
            --project=$PROJECT_ID
        echo "Workload Identity binding added."
    else
        echo "Workload Identity binding already exists."
    fi
else
    echo "Error: Kubernetes Service Account '$KSA_NAME' not found in namespace '$NAMESPACE'. Cannot bind Workload Identity." 
    # Optionally exit if this is critical
    # exit 1 
fi

echo "\n--- Step 5: Restart Master Backend Deployment (to pick up WI if binding was just added) --- "
# Check if deployment exists before trying to restart
if kubectl get deployment $HELM_RELEASE_BACKEND -n $NAMESPACE > /dev/null 2>&1; then
    echo "Restarting deployment '$HELM_RELEASE_BACKEND' to apply Workload Identity binding..."
    kubectl rollout restart deployment/$HELM_RELEASE_BACKEND -n $NAMESPACE
    echo "Waiting for deployment rollout to complete..."
    kubectl rollout status deployment/$HELM_RELEASE_BACKEND -n $NAMESPACE --timeout=5m
else
    echo "Warning: Deployment '$HELM_RELEASE_BACKEND' not found in namespace '$NAMESPACE'. Cannot restart."
fi

echo "\n--- Step 6: Deploy Master Frontend with Helm --- "
CHART_PATH_FRONTEND="./helm/master-frontend"
echo "Deploying/Updating $HELM_RELEASE_FRONTEND in namespace $NAMESPACE..."

helm upgrade --install $HELM_RELEASE_FRONTEND $CHART_PATH_FRONTEND \
  --namespace $NAMESPACE \
  -f helm/master-frontend/values.yaml \
  -f helm/master-frontend/values-gke.yaml \
  --wait

echo "Deployment of $HELM_RELEASE_FRONTEND completed."

echo "\n-----------------------------------------------------"
echo "Helm Deployment Script Completed!"
echo "Master Backend Release: $HELM_RELEASE_BACKEND"
echo "Master Frontend Release: $HELM_RELEASE_FRONTEND"
echo "-----------------------------------------------------" 