#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status.

CLUSTER_NAME="multi-tenant-dev"
# Config file is expected in the project root, where the script is likely run from
CONFIG_FILE="kind-config.yaml" 

echo "Checking if Kind cluster '${CLUSTER_NAME}' already exists..."
if kind get clusters | grep -q "^${CLUSTER_NAME}$"; then
  echo "Kind cluster '${CLUSTER_NAME}' already exists. No action taken."
  exit 0
fi

echo "Creating Kind cluster '${CLUSTER_NAME}' with config '${CONFIG_FILE}'..."

# Ensure the config file exists in the current directory
if [ ! -f "${CONFIG_FILE}" ]; then
    echo "Error: Config file '${CONFIG_FILE}' not found in the current directory ($(pwd)). Make sure it exists in the project root and run the script from there."
    exit 1
fi

kind create cluster --name "${CLUSTER_NAME}" --config "${CONFIG_FILE}"

echo "Kind cluster '${CLUSTER_NAME}' created successfully."

# Optional: Verify cluster creation
echo "Verifying cluster context..."
kubectl cluster-info --context "kind-${CLUSTER_NAME}" 