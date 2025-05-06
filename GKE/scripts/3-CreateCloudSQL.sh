#!/bin/bash

# This script creates a Cloud SQL PostgreSQL instance with a private IP
# within the specified VPC network.

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Configuration --- 
# Replace with your actual Project ID, Region, VPC Name, etc.
PROJECT_ID="nth-circlet-458901-h9"
REGION="asia-northeast3"
VPC_NAME="master-dashboard-vpc"
INSTANCE_NAME="master-backend-db"
DB_VERSION="POSTGRES_15" # Or choose another supported version
# Instance tier, e.g., db-f1-micro, db-g1-small, or custom machine types
TIER="db-f1-micro" # Choose an appropriate tier for your needs
# Root password for the default 'postgres' user - CHANGE THIS!
# For production, use a secret manager or generate a strong random password.
# DB_PASSWORD="VERY_STRONG_PASSWORD_CHANGE_ME" # Set via gcloud prompt instead for safety
DATABASE_NAME="master_db"
# Allocated IP range name created in 2-ConfigAccess.sh
PEERING_RANGE_NAME="google-managed-services-$VPC_NAME"
# ---------------------

echo "--- Step 1: Enable Cloud SQL Admin API --- "
SERVICE_TO_ENABLE="sqladmin.googleapis.com"
ENABLED_SERVICES=$(gcloud services list --project=$PROJECT_ID --filter="name:$SERVICE_TO_ENABLE" --format="value(name)")
if [ -z "$ENABLED_SERVICES" ]; then
    echo "Enabling Cloud SQL Admin API ($SERVICE_TO_ENABLE)..."
    gcloud services enable $SERVICE_TO_ENABLE --project=$PROJECT_ID
    echo "API $SERVICE_TO_ENABLE enabled."
else
    echo "API $SERVICE_TO_ENABLE is already enabled."
fi

echo "\n--- Step 2: Create Cloud SQL Instance --- "
# Check if instance already exists
INSTANCE_EXISTS=$(gcloud sql instances list --project=$PROJECT_ID --filter="name=$INSTANCE_NAME" --format="value(name)")
if [ -z "$INSTANCE_EXISTS" ]; then
    echo "Creating Cloud SQL PostgreSQL instance: $INSTANCE_NAME..."
    echo "You will be prompted to set the root (postgres) user password."
    gcloud sql instances create $INSTANCE_NAME \
        --project=$PROJECT_ID \
        --database-version=$DB_VERSION \
        --tier=$TIER \
        --region=$REGION \
        --network=$VPC_NAME \
        --no-assign-ip \
        --allocated-ip-range-name=$PEERING_RANGE_NAME \
        --storage-type=SSD \
        --storage-size=10GB # Minimum size
        # --root-password=$DB_PASSWORD # Avoid setting password directly in script
    echo "Cloud SQL instance '$INSTANCE_NAME' creation initiated. It may take several minutes."
    echo "Waiting for instance to be RUNNABLE..."
    gcloud sql instances wait $INSTANCE_NAME --project=$PROJECT_ID --timeout=unlimited
    echo "Cloud SQL instance '$INSTANCE_NAME' is now RUNNABLE."
else
    echo "Cloud SQL instance '$INSTANCE_NAME' already exists."
fi

echo "\n--- Step 3: Get Instance Private IP --- "
PRIVATE_IP=$(gcloud sql instances describe $INSTANCE_NAME --project=$PROJECT_ID --format='value(ipAddresses.filter(type=PRIVATE).extract(ipAddress).flatten())')
if [ -z "$PRIVATE_IP" ]; then
    echo "Error: Could not retrieve private IP address for instance '$INSTANCE_NAME'. Please check the instance status in the GCP console."
    exit 1
else
    echo "Instance '$INSTANCE_NAME' Private IP Address: $PRIVATE_IP"
    echo "(Remember this IP for your backend configuration)"
fi

echo "\n--- Step 4: Create Database within the Instance --- "
# Check if database already exists
DB_EXISTS=$(gcloud sql databases list --instance=$INSTANCE_NAME --project=$PROJECT_ID --filter="name=$DATABASE_NAME" --format="value(name)")
if [ -z "$DB_EXISTS" ]; then
    echo "Creating database: $DATABASE_NAME..."
    gcloud sql databases create $DATABASE_NAME \
        --instance=$INSTANCE_NAME \
        --project=$PROJECT_ID \
        --charset=UTF8 # Optional: Specify charset and collation if needed
        # --collation=en_US.UTF8
    echo "Database '$DATABASE_NAME' created."
else
    echo "Database '$DATABASE_NAME' already exists."
fi

echo "\n-----------------------------------------------------"
echo "Cloud SQL Instance and Database Creation/Check Completed!"
echo "Instance Name: $INSTANCE_NAME"
echo "Private IP: $PRIVATE_IP"
echo "Database Name: $DATABASE_NAME"
echo "Remember to set the root password if prompted and securely store it."
echo "-----------------------------------------------------" 