#!/bin/bash

# This script configures Private Service Access for the VPC network,
# allowing Cloud SQL (and other managed services) to connect using private IPs.

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Configuration --- 
# Replace with your actual Project ID and VPC Name
PROJECT_ID="nth-circlet-458901-h9"
VPC_NAME="master-dashboard-vpc"
# Reserved IP range name for the service networking connection
PEERING_RANGE_NAME="google-managed-services-$VPC_NAME"
# The CIDR block for the allocated range. MUST NOT OVERLAP with existing subnets.
# Use a /16 to /24 range depending on the expected number of service instances.
ALLOCATED_IP_CIDR="10.2.0.0/24" # Example range, MUST BE ADJUSTED if it overlaps!
# ---------------------

echo "--- Step 1: Enable Service Networking API --- "
SERVICE_TO_ENABLE="servicenetworking.googleapis.com"
ENABLED_SERVICES=$(gcloud services list --project=$PROJECT_ID --filter="name:$SERVICE_TO_ENABLE" --format="value(name)")
if [ -z "$ENABLED_SERVICES" ]; then
    echo "Enabling Service Networking API ($SERVICE_TO_ENABLE)..."
    gcloud services enable $SERVICE_TO_ENABLE --project=$PROJECT_ID
    echo "API $SERVICE_TO_ENABLE enabled."
else
    echo "API $SERVICE_TO_ENABLE is already enabled."
fi

echo "\n--- Step 2: Allocate IP Range for Service Networking --- "
# Check if the range already exists
RANGE_EXISTS=$(gcloud compute addresses list --project=$PROJECT_ID --filter="name=$PEERING_RANGE_NAME AND purpose=VPC_PEERING" --global --format="value(name)")
if [ -z "$RANGE_EXISTS" ]; then
    echo "Allocating IP range $PEERING_RANGE_NAME ($ALLOCATED_IP_CIDR) for VPC Peering..."
    gcloud compute addresses create $PEERING_RANGE_NAME \
        --global \
        --purpose=VPC_PEERING \
        --prefix-length=${ALLOCATED_IP_CIDR##*/} \ # Extract prefix length (e.g., 24)
        --network=$VPC_NAME \
        --project=$PROJECT_ID \
        --description="Allocated range for Google Managed Services in $VPC_NAME"
        # Note: If you need a specific range, use --addresses= instead of --prefix-length
        #       and ensure it matches the prefix length calculation.
        # --addresses=${ALLOCATED_IP_CIDR%/*} \ # Extract address part (e.g., 10.2.0.0)
    echo "IP range '$PEERING_RANGE_NAME' allocated."
else
    echo "IP range '$PEERING_RANGE_NAME' for VPC Peering already exists."
fi

echo "\n--- Step 3: Create VPC Peering Connection --- "
# Check if the peering connection already exists
PEERING_EXISTS=$(gcloud services vpc-peerings list --network=$VPC_NAME --project=$PROJECT_ID --filter="peering=$PEERING_RANGE_NAME" --format="value(peering)")
if [ -z "$PEERING_EXISTS" ]; then
    echo "Creating VPC Peering connection between $VPC_NAME and Google Managed Services..."
    gcloud services vpc-peerings connect \
        --service=servicenetworking.googleapis.com \
        --ranges=$PEERING_RANGE_NAME \
        --network=$VPC_NAME \
        --project=$PROJECT_ID
    echo "VPC Peering connection created."
else
    echo "VPC Peering connection '$PEERING_RANGE_NAME' already exists."
fi

echo "\n-----------------------------------------------------"
echo "Private Service Access Configuration/Check Completed!"
echo "Ensure the allocated range '$ALLOCATED_IP_CIDR' does not conflict."
 echo "-----------------------------------------------------" 