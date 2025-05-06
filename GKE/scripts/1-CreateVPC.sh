#!/bin/bash

# This script creates the custom VPC and subnet for the Master Dashboard project.

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Configuration --- 
# Replace with your actual Project ID and Region
PROJECT_ID="nth-circlet-458901-h9"
REGION="asia-northeast3"
VPC_NAME="master-dashboard-vpc"
SUBNET_NAME="master-dashboard-subnet"
SUBNET_CIDR="10.0.0.0/20" # Example CIDR, adjust if needed
# ---------------------

echo "--- Step 1: Create Custom VPC --- "
# Check if VPC already exists
VPC_EXISTS=$(gcloud compute networks list --project=$PROJECT_ID --filter="name=$VPC_NAME" --format="value(name)")
if [ -z "$VPC_EXISTS" ]; then
    echo "Creating VPC: $VPC_NAME..."
    gcloud compute networks create $VPC_NAME \
        --project=$PROJECT_ID \
        --subnet-mode=custom \
        --bgp-routing-mode=regional
    echo "VPC '$VPC_NAME' created."
else
    echo "VPC '$VPC_NAME' already exists."
fi

echo "\n--- Step 2: Create Subnet in VPC --- "
# Check if Subnet already exists
SUBNET_EXISTS=$(gcloud compute networks subnets list --project=$PROJECT_ID --filter="name=$SUBNET_NAME AND region=$REGION" --format="value(name)")
if [ -z "$SUBNET_EXISTS" ]; then
    echo "Creating Subnet: $SUBNET_NAME in region $REGION..."
    gcloud compute networks subnets create $SUBNET_NAME \
        --project=$PROJECT_ID \
        --network=$VPC_NAME \
        --region=$REGION \
        --range=$SUBNET_CIDR \
        --enable-private-ip-google-access # Optional: Allow VMs without external IPs to reach Google APIs
    echo "Subnet '$SUBNET_NAME' created in VPC '$VPC_NAME'."
else
    echo "Subnet '$SUBNET_NAME' in region '$REGION' already exists."
fi

echo "\n-----------------------------------------------------"
echo "VPC and Subnet Creation/Check Completed!"
echo "VPC Name: $VPC_NAME"
echo "Subnet Name: $SUBNET_NAME ($REGION)"
echo "-----------------------------------------------------" 