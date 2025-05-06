#!/bin/bash

# This script sets up ExternalDNS on GKE using Google Cloud DNS provider
# and Workload Identity.

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Configuration ---
# Ensure this matches your GCP project ID and desired settings
PROJECT_ID="nth-circlet-458901-h9"
EXTDNS_GSA_NAME="external-dns-gsa"
EXTDNS_GSA_EMAIL="$EXTDNS_GSA_NAME@$PROJECT_ID.iam.gserviceaccount.com"
EXTDNS_NAMESPACE="external-dns" # Namespace where ExternalDNS will be deployed
EXTDNS_KSA_NAME="external-dns"   # KSA name defined in values-external-dns.yaml
EXTDNS_HELM_RELEASE="external-dns"
EXTDNS_VALUES_FILE="GKE/config/values-external-dns.yaml" # Relative path from project root
EXTDNS_REPO_URL="https://kubernetes-sigs.github.io/external-dns/"
EXTDNS_REPO_NAME="external-dns"
EXTDNS_CHART_NAME="external-dns/external-dns"
# ---------------------

echo "--- Starting ExternalDNS Setup --- "

# Check if ExternalDNS values file exists
if [ ! -f "$EXTDNS_VALUES_FILE" ]; then
    echo "Error: ExternalDNS values file '$EXTDNS_VALUES_FILE' not found."
    echo "Please create this file (e.g., GKE/config/values-external-dns.yaml) with appropriate settings."
    exit 1
fi

# Step 1: Create GSA for ExternalDNS
echo "\n--- Step 1: Create Google Cloud Service Account (GSA) for ExternalDNS ---"
echo "Checking/Creating GSA: $EXTDNS_GSA_NAME..."
if ! gcloud iam service-accounts describe "$EXTDNS_GSA_EMAIL" --project="$PROJECT_ID" > /dev/null 2>&1; then
    gcloud iam service-accounts create "$EXTDNS_GSA_NAME" \
        --project="$PROJECT_ID" \
        --display-name="ExternalDNS Service Account"
    echo "GSA '$EXTDNS_GSA_NAME' created."
else
    echo "GSA '$EXTDNS_GSA_NAME' ($EXTDNS_GSA_EMAIL) already exists."
fi

# Step 2: Grant DNS Admin Role to GSA
echo "\n--- Step 2: Grant IAM Roles to ExternalDNS GSA ---"
echo "Checking/Binding DNS Admin role to GSA $EXTDNS_GSA_EMAIL..."
DNS_ADMIN_BINDING_EXISTS=$(gcloud projects get-iam-policy "$PROJECT_ID" --flatten="bindings[].members" --format='value(bindings.role)' --filter="bindings.role=roles/dns.admin AND bindings.members=serviceAccount:$EXTDNS_GSA_EMAIL")
if [ -z "$DNS_ADMIN_BINDING_EXISTS" ]; then
    echo "Binding role roles/dns.admin..."
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:$EXTDNS_GSA_EMAIL" \
        --role="roles/dns.admin" \
        --condition=None # Required for no condition
    echo "Role roles/dns.admin bound."
else
    echo "Role roles/dns.admin already bound."
fi

# Step 3: Add ExternalDNS Helm Repo
echo "\n--- Step 3: Add/Update ExternalDNS Helm Repository ---"
echo "Adding/Updating ExternalDNS Helm repository..."
helm repo add "$EXTDNS_REPO_NAME" "$EXTDNS_REPO_URL" || true # Allow command to fail if repo already exists
helm repo update "$EXTDNS_REPO_NAME"

# Step 4: Deploy ExternalDNS using Helm
echo "\n--- Step 4: Deploy ExternalDNS with Helm ---"
echo "Deploying/Updating ExternalDNS release '$EXTDNS_HELM_RELEASE' in namespace '$EXTDNS_NAMESPACE'..."
kubectl create namespace "$EXTDNS_NAMESPACE" --dry-run=client -o yaml | kubectl apply -f - # Ensure namespace exists
helm upgrade --install "$EXTDNS_HELM_RELEASE" "$EXTDNS_CHART_NAME" \
  --namespace "$EXTDNS_NAMESPACE" \
  -f "$EXTDNS_VALUES_FILE" \
  --wait # Wait for deployment to complete (this ensures KSA is created before next step)

echo "ExternalDNS deployment completed. Waiting briefly..."
sleep 10

# Step 5: Bind GSA to ExternalDNS KSA (Workload Identity)
echo "\n--- Step 5: Bind GSA to ExternalDNS KSA (Workload Identity) ---"
echo "Checking/Binding Workload Identity for ExternalDNS KSA ($EXTDNS_NAMESPACE/$EXTDNS_KSA_NAME)..."
RESTART_NEEDED=false
if kubectl get serviceaccount "$EXTDNS_KSA_NAME" --namespace "$EXTDNS_NAMESPACE" > /dev/null 2>&1; then
    EXTDNS_WI_BINDING_EXISTS=$(gcloud iam service-accounts get-iam-policy "$EXTDNS_GSA_EMAIL" --project="$PROJECT_ID" --flatten="bindings[].members" --format='value(bindings.role)' --filter="bindings.role=roles/iam.workloadIdentityUser AND bindings.members=serviceAccount:$PROJECT_ID.svc.id.goog[$EXTDNS_NAMESPACE/$EXTDNS_KSA_NAME]")
    if [ -z "$EXTDNS_WI_BINDING_EXISTS" ]; then
        echo "Adding Workload Identity User role binding for ExternalDNS..."
        gcloud iam service-accounts add-iam-policy-binding "$EXTDNS_GSA_EMAIL" \
            --role="roles/iam.workloadIdentityUser" \
            --member="serviceAccount:$PROJECT_ID.svc.id.goog[$EXTDNS_NAMESPACE/$EXTDNS_KSA_NAME]" \
            --project="$PROJECT_ID"
        echo "ExternalDNS Workload Identity binding added."
        RESTART_NEEDED=true # Set flag to restart deployment
    else
        echo "ExternalDNS Workload Identity binding already exists."
    fi
else
    echo "Error: ExternalDNS KSA '$EXTDNS_KSA_NAME' not found in namespace '$EXTDNS_NAMESPACE'. Cannot bind Workload Identity."
    # Consider exiting if this is critical
    # exit 1
fi

# Step 6: Restart ExternalDNS Deployment if WI binding was just added
if [ "$RESTART_NEEDED" = true ]; then
    echo "\n--- Step 6: Restart ExternalDNS Deployment to Apply Workload Identity ---"
    echo "Restarting ExternalDNS deployment..."
    kubectl rollout restart deployment/"$EXTDNS_HELM_RELEASE" -n "$EXTDNS_NAMESPACE"
    echo "Waiting for ExternalDNS rollout to complete..."
    kubectl rollout status deployment/"$EXTDNS_HELM_RELEASE" -n "$EXTDNS_NAMESPACE" --timeout=2m
else
    echo "\n--- Step 6: Restart not needed for ExternalDNS Deployment ---"
fi

echo "\n-------------------------------------"
echo "ExternalDNS Setup Script Completed!" 