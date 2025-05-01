#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status.

echo "--- Cleaning up Demo Application Resources ---"

# 1. Delete application resources applied via kubectl
# Order doesn't strictly matter here, but grouping makes sense.

echo "\n[1/4] Deleting application resources in 'demo-app' namespace..."
kubectl delete -f helm/api-golang -n demo-app --ignore-not-found=true
kubectl delete -f helm/api-node -n demo-app --ignore-not-found=true
kubectl delete -f helm/client-react -n demo-app --ignore-not-found=true
kubectl delete -f helm/load-generator-python -n demo-app --ignore-not-found=true

kubectl delete -f helm/common/Middleware.yaml -n demo-app --ignore-not-found=true
kubectl delete -f helm/postgresql/Job.db-migrator.yaml -n demo-app --ignore-not-found=true
kubectl delete -f helm/postgresql/Secret.db-password.yaml -n demo-app --ignore-not-found=true

# 2. Uninstall Helm releases
echo "\n[2/4] Uninstalling Helm releases..."
helm uninstall postgres -n postgres --ignore-not-found
helm uninstall traefik -n traefik --ignore-not-found

# 3. Delete Namespaces
# Deleting namespaces will remove any remaining resources within them.
echo "\n[3/4] Deleting Namespaces (demo-app, postgres, traefik)..."
kubectl delete namespace demo-app --ignore-not-found=true
kubectl delete namespace postgres --ignore-not-found=true
kubectl delete namespace traefik --ignore-not-found=true

# 4. Remove Helm repositories (optional, but good practice)
echo "\n[4/4] Removing Helm repositories (bitnami, traefik)..."
helm repo remove bitnami || true # Ignore errors if repo doesn't exist
helm repo remove traefik || true # Ignore errors if repo doesn't exist

echo "\n--- Cleanup Complete ---" 