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

# --- Install Traefik using Helm ---
echo "---------------------------------------"
echo "Installing Traefik Ingress Controller..."
echo "---------------------------------------"

# Ensure Helm is installed (simple check)
if ! command -v helm &> /dev/null
then
    echo "Error: Helm is not installed. Please install Helm first (https://helm.sh/docs/intro/install/)"
    # Optional: You could attempt to delete the cluster here if Helm isn't found,
    # or just exit and let the user handle it.
    # kind delete cluster --name "${CLUSTER_NAME}"
    exit 1
fi

echo "Adding Traefik Helm repository..."
helm repo add traefik https://helm.traefik.io/traefik || true # Allow command to fail if repo already exists
helm repo update

echo "Installing Traefik..."
# We install it into the kube-system namespace for simplicity here,
# but you could use a dedicated namespace like 'traefik'.
helm install traefik traefik/traefik \
  --namespace kube-system \
  --set=providers.kubernetesCRD.allowCrossNamespace=true \
  --set=providers.kubernetesCRD.enabled=true \
  --set=providers.kubernetesIngress.enabled=true \
  --set=providers.kubernetesIngress.allowExternalNameServices=true \
  # Uncomment below to enable the dashboard on an insecure route for local dev (use with caution)
  # --set=dashboard.enabled=true
  # --set=dashboard.insecure=true

echo "Traefik installation initiated."
echo "Waiting a bit for Traefik pods to start..."
sleep 10 # Give pods a moment to initialize before checking

kubectl get pods -n kube-system -l app.kubernetes.io/name=traefik --no-headers=true
if [ $? -ne 0 ] || [ -z "$(kubectl get pods -n kube-system -l app.kubernetes.io/name=traefik --no-headers=true)" ]; then
    echo "Warning: Traefik pods not found immediately. Check status manually: kubectl get pods -n kube-system -l app.kubernetes.io/name=traefik"
else
    echo "Traefik pods:"
    kubectl get pods -n kube-system -l app.kubernetes.io/name=traefik
fi
echo "---------------------------------------"
# --- End Traefik Installation ---


# Optional: Verify cluster creation
echo "Verifying cluster context..."
kubectl cluster-info --context "kind-${CLUSTER_NAME}" 