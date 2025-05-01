#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status.

CLUSTER_NAME="multi-tenant-dev"

echo "Checking if Kind cluster '${CLUSTER_NAME}' exists..."
if kind get clusters | grep -q "^${CLUSTER_NAME}$"; then
  echo "Deleting Kind cluster: ${CLUSTER_NAME}..."
  kind delete cluster --name "${CLUSTER_NAME}"
  echo "Kind cluster ${CLUSTER_NAME} deleted successfully."
else
  echo "Kind cluster '${CLUSTER_NAME}' does not exist. No action taken."
fi 