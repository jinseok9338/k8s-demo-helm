#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# Define variables
RELEASE_NAME="master-backend-release"
CHART_PATH="helm/master-backend"
NAMESPACE="master"

# Deploy the master-backend chart
echo "Deploying ${RELEASE_NAME} from chart ${CHART_PATH} into namespace ${NAMESPACE}..."

helm upgrade --install ${RELEASE_NAME} \
  ${CHART_PATH} \
  --namespace ${NAMESPACE} \
  --create-namespace \
  --wait # Wait for resources to become ready

echo "Deployment of ${RELEASE_NAME} complete." 