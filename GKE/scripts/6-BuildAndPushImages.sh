#!/bin/bash

# This script builds Docker images for the master and tenant applications,
# targeting the linux/amd64 platform compatible with GKE nodes,
# and pushes them to Google Artifact Registry.

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Configuration --- 
# Replace with your actual Project ID and Region if different
PROJECT_ID="nth-circlet-458901-h9"
REGION="asia-northeast3"
REPO_NAME="master-apps-repo" # Artifact Registry repository name

# Image Tags (Update these to the desired versions)
MASTER_BACKEND_TAG="0.1.19" # Updated to the latest version built
MASTER_FRONTEND_TAG="0.1.1" # Check if this is the correct version
TENANT_BACKEND_TAG="0.1.0"  # Check if this is the correct version for backend-api-poc
TENANT_FRONTEND_TAG="v0.2.0" # Check if this is the correct version for front-end-user
# ---------------------

# Construct the full repository path
ARTIFACT_REGISTRY_PATH="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}"

# Authenticate Docker with Artifact Registry (recommended)
echo "Configuring Docker authentication for ${REGION}..."
gcloud auth configure-docker ${REGION}-docker.pkg.dev

# Get the absolute path of the script's directory
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
# Go to the root directory of the project (assuming scripts are in GKE/scripts)
PROJECT_ROOT="${SCRIPT_DIR}/../.."
cd "${PROJECT_ROOT}"
echo "Changed directory to project root: $(pwd)"

# --- Build and Push Master Backend ---
APP_DIR="applications/master-backend"
IMAGE_NAME="master-backend"
IMAGE_TAG="${MASTER_BACKEND_TAG}"
FULL_IMAGE_NAME="${ARTIFACT_REGISTRY_PATH}/${IMAGE_NAME}:${IMAGE_TAG}"
echo "\nBuilding and pushing Master Backend ($FULL_IMAGE_NAME) for linux/amd64 from ${APP_DIR}..."
if [ -d "${APP_DIR}" ]; then
  docker buildx build --platform linux/amd64 -t "${FULL_IMAGE_NAME}" --push "${APP_DIR}"
echo "Master Backend push complete."
else
  echo "Error: Directory ${APP_DIR} not found."
  exit 1
fi

# --- Build and Push Master Frontend ---
APP_DIR="applications/master-frontend"
IMAGE_NAME="master-frontend"
IMAGE_TAG="${MASTER_FRONTEND_TAG}"
FULL_IMAGE_NAME="${ARTIFACT_REGISTRY_PATH}/${IMAGE_NAME}:${IMAGE_TAG}"
echo "\nBuilding and pushing Master Frontend ($FULL_IMAGE_NAME) for linux/amd64 from ${APP_DIR}..."
if [ -d "${APP_DIR}" ]; then
  docker buildx build --platform linux/amd64 -t "${FULL_IMAGE_NAME}" --push "${APP_DIR}"
echo "Master Frontend push complete."
else
  echo "Error: Directory ${APP_DIR} not found."
  exit 1
fi

# --- Build and Push Tenant Backend API ---
# Note: Adjust APP_DIR and IMAGE_NAME if they differ
APP_DIR="applications/backend-api" # Assuming this is the correct directory
IMAGE_NAME="backend-api-poc" # Image name used in values-gke.yaml
IMAGE_TAG="${TENANT_BACKEND_TAG}"
FULL_IMAGE_NAME="${ARTIFACT_REGISTRY_PATH}/${IMAGE_NAME}:${IMAGE_TAG}"
echo "\nBuilding and pushing Tenant Backend ($FULL_IMAGE_NAME) for linux/amd64 from ${APP_DIR}..."
if [ -d "${APP_DIR}" ]; then
  docker buildx build --platform linux/amd64 -t "${FULL_IMAGE_NAME}" --push "${APP_DIR}"
echo "Tenant Backend push complete."
else
  echo "Warning: Directory ${APP_DIR} not found. Skipping Tenant Backend build."
fi

# --- Build and Push Tenant User Frontend ---
# Note: Adjust APP_DIR and IMAGE_NAME if they differ
APP_DIR="applications/user-frontend" # Assuming this is the correct directory
IMAGE_NAME="front-end-user" # Image name used in values-gke.yaml
IMAGE_TAG="${TENANT_FRONTEND_TAG}"
FULL_IMAGE_NAME="${ARTIFACT_REGISTRY_PATH}/${IMAGE_NAME}:${IMAGE_TAG}"
echo "\nBuilding and pushing Tenant Frontend ($FULL_IMAGE_NAME) for linux/amd64 from ${APP_DIR}..."
if [ -d "${APP_DIR}" ]; then
  docker buildx build --platform linux/amd64 -t "${FULL_IMAGE_NAME}" --push "${APP_DIR}"
echo "Tenant Frontend push complete."
else
  echo "Warning: Directory ${APP_DIR} not found. Skipping Tenant Frontend build."
fi

echo "\n---------------------------------------"
echo "All image builds and pushes complete!"
echo "---------------------------------------" 