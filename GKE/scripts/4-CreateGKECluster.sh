#!/bin/bash

# This script creates a GKE Autopilot cluster within the specified VPC subnet.

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Configuration --- 
# Replace with your actual Project ID, Region, Names, etc.
PROJECT_ID="nth-circlet-458901-h9"
REGION="asia-northeast3"
VPC_NAME="master-dashboard-vpc"
SUBNET_NAME="master-dashboard-subnet"
CLUSTER_NAME="master-dashboard-cluster"
# ---------------------

# Construct the full subnet self-link
SUBNET_LINK="projects/$PROJECT_ID/regions/$REGION/subnetworks/$SUBNET_NAME"

echo "--- Step 1: Enable GKE API --- "
SERVICE_TO_ENABLE="container.googleapis.com"
ENABLED_SERVICES=$(gcloud services list --project=$PROJECT_ID --filter="name:$SERVICE_TO_ENABLE" --format="value(name)")
if [ -z "$ENABLED_SERVICES" ]; then
    echo "Enabling GKE API ($SERVICE_TO_ENABLE)..."
    gcloud services enable $SERVICE_TO_ENABLE --project=$PROJECT_ID
    echo "API $SERVICE_TO_ENABLE enabled."
else
    echo "API $SERVICE_TO_ENABLE is already enabled."
fi

echo "\n--- Step 2: Create GKE Autopilot Cluster --- "
# Check if cluster already exists
CLUSTER_EXISTS=$(gcloud container clusters list --project=$PROJECT_ID --filter="name=$CLUSTER_NAME AND location=$REGION" --format="value(name)")
if [ -z "$CLUSTER_EXISTS" ]; then
    echo "Creating GKE Autopilot cluster: $CLUSTER_NAME in region $REGION..."
    gcloud container clusters create-auto $CLUSTER_NAME \
        --project=$PROJECT_ID \
        --region=$REGION \
        --network=$VPC_NAME \
        --subnetwork=$SUBNET_LINK \
        --release-channel=regular # Or rapid, stable
        # Optional flags:
        # --cluster-version=LATEST # Or specify a version
        # --enable-private-nodes # For private cluster
        # --master-ipv4-cidr=... # If using private nodes
        # --enable-ip-alias # Usually enabled by default for Autopilot
    echo "GKE cluster '$CLUSTER_NAME' creation initiated. This will take several minutes."
else
    echo "GKE cluster '$CLUSTER_NAME' in region '$REGION' already exists."
fi

echo "\n--- Step 3: Get Cluster Credentials --- "
echo "Fetching credentials for cluster '$CLUSTER_NAME'..."
gcloud container clusters get-credentials $CLUSTER_NAME \
    --region=$REGION \
    --project=$PROJECT_ID
echo "kubectl context configured to connect to '$CLUSTER_NAME'."

echo "\n-----------------------------------------------------"
echo "GKE Cluster Creation/Check and Credential Fetching Completed!"
echo "Cluster Name: $CLUSTER_NAME ($REGION)"
echo "-----------------------------------------------------" 