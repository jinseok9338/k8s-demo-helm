#!/bin/bash

# This script prepares the GKE cluster by creating the necessary namespace
# and the secret containing the Cloud SQL database connection URL.

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Configuration --- 
# Replace with your actual Project ID, Region, and Cloud SQL details
PROJECT_ID="nth-circlet-458901-h9"
REGION="asia-northeast3"
INSTANCE_NAME="master-backend-db"
DATABASE_NAME="master_db"
DB_USER="postgres"
# IMPORTANT: Retrieve the actual password securely. Avoid hardcoding.
# This script assumes you will provide the password when prompted.
DB_PASSWORD="VERY_STRONG_PASSWORD_CHANGE_ME"
NAMESPACE="master"
SECRET_NAME="master-db-secret"
SECRET_KEY="DATABASE_URL"
# ---------------------

# --- Step 1: Get Cloud SQL Private IP --- 
echo "Fetching private IP for Cloud SQL instance '$INSTANCE_NAME'..."
PRIVATE_IP=$(gcloud sql instances describe $INSTANCE_NAME --project=$PROJECT_ID --format='value(ipAddresses.filter(type=PRIVATE).extract(ipAddress).flatten())')
if [ -z "$PRIVATE_IP" ]; then
    echo "Error: Could not retrieve private IP address for instance '$INSTANCE_NAME'. Please ensure the instance exists and has a private IP."
    exit 1
else
    echo "Found Private IP: $PRIVATE_IP"
fi

# --- Step 2: Prompt for Database Password --- 
# Prompt the user for the password securely
read -sp "Enter password for Cloud SQL user '$DB_USER': " DB_PASSWORD
echo # Add a newline after the password input

if [ -z "$DB_PASSWORD" ]; then
    echo "Error: Database password cannot be empty."
    exit 1
fi

# Construct the DATABASE_URL
# Format: postgresql://<user>:<password>@<host>:<port>/<database>
DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@$PRIVATE_IP:5432/$DATABASE_NAME"

# --- Step 3: Create Namespace --- 
echo "\nEnsuring namespace '$NAMESPACE' exists..."
kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# --- Step 4: Create/Update Database Secret --- 
echo "\nChecking for existing secret '$SECRET_NAME' in namespace '$NAMESPACE'..."
# Check if secret exists
if kubectl get secret $SECRET_NAME --namespace $NAMESPACE > /dev/null 2>&1; then
    echo "Secret '$SECRET_NAME' already exists. Deleting existing secret..."
    kubectl delete secret $SECRET_NAME --namespace $NAMESPACE
fi

echo "Creating secret '$SECRET_NAME' in namespace '$NAMESPACE'..."
kubectl create secret generic $SECRET_NAME \
  --namespace $NAMESPACE \
  --from-literal=$SECRET_KEY="$DATABASE_URL"

echo "Secret '$SECRET_NAME' created successfully."

# --- Step 5: Create ManagedCertificate for Ingress --- 
echo "\nChecking/Creating ManagedCertificate 'master-cert' for domain master.jinseok9338.info..."
CERT_YAML="apiVersion: networking.gke.io/v1
kind: ManagedCertificate
metadata:
  name: master-cert
  namespace: $NAMESPACE
spec:
  domains:
    - master.jinseok9338.info"

# Use apply to create or update the certificate resource idempotently
echo "$CERT_YAML" | kubectl apply -f -

echo "ManagedCertificate 'master-cert' applied."

# Unset password variable for security
unset DB_PASSWORD
unset DATABASE_URL

echo "\n-----------------------------------------------------"
echo "Namespace, Database Secret, and Managed Certificate Preparation Completed!"
echo "Namespace: $NAMESPACE"
echo "Secret Name: $SECRET_NAME (Key: $SECRET_KEY)"
echo "Certificate Name: master-cert (Domain: master.jinseok9338.info)"
echo "-----------------------------------------------------" 