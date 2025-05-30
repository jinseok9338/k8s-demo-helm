#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status.

CLUSTER_NAME="multi-tenant-dev"
CONTEXT_NAME="kind-${CLUSTER_NAME}"

echo "--- Checking Cluster Status for '${CLUSTER_NAME}' ---"

# 1. Verify current kubectl context
echo "\n[1/5] Verifying kubectl context..."
CURRENT_CONTEXT=$(kubectl config current-context)
if [ "${CURRENT_CONTEXT}" == "${CONTEXT_NAME}" ]; then
  echo "OK: Current context is '${CONTEXT_NAME}'."
else
  echo "WARNING: Current context is '${CURRENT_CONTEXT}', expected '${CONTEXT_NAME}'."
  echo "Attempting to use context '${CONTEXT_NAME}' for checks..."
fi

# 2. Check Node Status
echo "\n[2/5] Checking Node Status..."
kubectl --context "${CONTEXT_NAME}" get nodes -o wide

# 3. Check Core System Pods Status (kube-system namespace)
echo "\n[3/5] Checking Core System Pods (kube-system)..."
kubectl --context "${CONTEXT_NAME}" get pods -n kube-system

# 4. Check CoreDNS Pods Status (kube-system namespace)
echo "\n[4/5] Checking CoreDNS Pods (kube-system)..."
kubectl --context "${CONTEXT_NAME}" get pods -n kube-system -l k8s-app=kube-dns

# 5. Check Traefik Pods Status (kube-system namespace)
echo "\n[5/5] Checking Traefik Pods (kube-system)..."
kubectl --context "${CONTEXT_NAME}" get pods -n kube-system -l app.kubernetes.io/name=traefik

echo "\n--- Cluster Status Check Complete ---" 