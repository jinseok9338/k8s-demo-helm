import {Hono} from "hono";
import {logger} from "hono/logger";
import {serve} from "@hono/node-server";
import "dotenv/config";

// Set up database connection using Drizzle ORM and pg
import {drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";
import {eq, sql} from "drizzle-orm"; // Import eq and sql for comparisons
import * as schema from "./db/schema.js";
import {cors} from "hono/cors";
// Import the error parsing utility
import {
  parseKubernetesError,
  ParsedKubeError,
} from "./utils/kubernetes-error.js";

// --- Kubernetes Client Setup ---
import {
  KubeConfig,
  CoreV1Api,
  VersionApi,
  AppsV1Api,
  V1Deployment,
  V1StatefulSet,
} from "@kubernetes/client-node"; // Import necessary modules for Helm execution and WebSocket
import {spawn} from "child_process";

const app = new Hono();
// Apply CORS globally or for specific paths, allowing the frontend origin
app.use(
  "*", // Apply to all paths
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Specify allowed methods
    allowHeaders: ["Content-Type", "Authorization"], // Specify allowed headers if necessary
    credentials: true, // If you need to send cookies or authorization headers
  })
);
// app.use("/api", cors()); // Remove or adjust this line if the global one replaces it
// --- Status Constants ---
const STATUS_PENDING = "PENDING";
const STATUS_DEPLOYING_PG = "DEPLOYING_PG";
const STATUS_DEPLOYING_BE = "DEPLOYING_BE";
const STATUS_DEPLOYING_FE = "DEPLOYING_FE";
const STATUS_READY = "READY";
const STATUS_FAILED = "FAILED";
const STATUS_UNKNOWN = "UNKNOWN"; // Default/initial state if needed
const STATUS_DESTROYING = "DESTROYING"; // Added
const STATUS_DELETE_FAILED = "DELETE_FAILED"; // Added
// NOT_READY status is implicitly used when resources are down or config missing
// But let's define it if we want to explicitly set it after deletion
const STATUS_NOT_READY = "NOT_READY";
// Add constants for stopping services
const STATUS_STOPPING = "STOPPING";
const STATUS_STOPPED = "STOPPED";
const STATUS_STOP_FAILED = "STOP_FAILED";
// Add constants for starting services
const STATUS_STARTING = "STARTING";
const STATUS_START_FAILED = "START_FAILED";

// --- Database Update Helper ---
async function updateTenantStatus(
  companyCode: string,
  status: string
): Promise<void> {
  console.log(`Updating status for tenant ${companyCode} to ${status}`);
  try {
    await db
      .update(schema.tenants)
      .set({status: status, updatedAt: new Date()})
      .where(eq(schema.tenants.companyCode, companyCode));
    console.log(`Successfully updated status for ${companyCode} to ${status}`);
  } catch (error) {
    console.error(
      `Failed to update status for tenant ${companyCode} to ${status}:`,
      error
    );
    // Decide if this error should halt deployment or just be logged
    // For now, just log it.
  }
}

// --- Helm Execution Helper ---
async function runHelmCommandAndStream(
  companyCode: string,
  helmArgs: string[],
  stepName: string // e.g., 'postgresql', 'backend-api'
): Promise<void> {
  const command = "helm";
  const prefix = `[helm-${stepName}]`;

  // --- ADDED: Ensure Helm repo is added and updated ---
  try {
    console.log(
      `${prefix} Ensuring bitnami repository exists and is updated...`
    );
    // Use a helper async function to handle spawn promise logic cleanly
    const runSpawn = (
      cmd: string,
      args: string[]
    ): Promise<{code: number | null; stdout: string; stderr: string}> => {
      return new Promise((resolve, reject) => {
        const process = spawn(cmd, args, {stdio: "pipe"});
        let stdoutData = "";
        let stderrData = "";
        process.stdout?.on("data", (data) => (stdoutData += data.toString()));
        process.stderr?.on("data", (data) => (stderrData += data.toString()));
        process.on("close", (code) =>
          resolve({code, stdout: stdoutData, stderr: stderrData})
        );
        process.on("error", reject);
      });
    };

    // Add repo
    const addResult = await runSpawn(command, [
      "repo",
      "add",
      "bitnami",
      "https://charts.bitnami.com/bitnami",
    ]);
    if (addResult.code === 0 || addResult.stderr.includes("already exists")) {
      console.log(`${prefix} Bitnami repo added or already exists.`);
      // Update repo
      const updateResult = await runSpawn(command, ["repo", "update"]);
      if (updateResult.code === 0) {
        console.log(`${prefix} Helm repositories updated successfully.`);
      } else {
        console.error(`${prefix} [STDERR] Helm repo update failed with code ${updateResult.code}:
${updateResult.stderr}`);
        throw new Error("Helm repo update failed.");
      }
    } else {
      console.error(`${prefix} [STDERR] Helm repo add failed with code ${addResult.code}:
${addResult.stderr}`);
      throw new Error("Helm repo add failed.");
    }
    console.log(`${prefix} Helm repository setup complete.`);
  } catch (setupError: any) {
    console.error(
      `${prefix} Failed Helm repository setup: ${setupError.message}`
    );
    // Propagate the error to stop the deployment process
    throw new Error(
      `Helm repository setup failed for ${stepName} (tenant: ${companyCode}): ${setupError.message}`
    );
  }
  // --- END ADDED ---

  console.log(
    `${prefix} Starting execution for ${companyCode}: ${command} ${helmArgs.join(
      " "
    )}`
  );

  return new Promise((resolve, reject) => {
    const process = spawn(command, helmArgs, {stdio: ["pipe", "pipe", "pipe"]});

    let stdoutData = "";
    let stderrData = "";

    process.stdout?.on("data", (data) => {
      const output = data.toString();
      stdoutData += output;
      output
        .split("\n")
        .filter((line: string) => line.trim() !== "")
        .forEach((line: string) => {
          console.log(`${prefix} ${line}`);
        });
    });

    process.stderr?.on("data", (data) => {
      const output = data.toString();
      stderrData += output;
      output
        .split("\n")
        .filter((line: string) => line.trim() !== "")
        .forEach((line: string) => {
          console.error(`${prefix} [STDERR] ${line}`);
        });
    });

    process.on("close", (code) => {
      console.log(
        `${prefix} Process for ${companyCode} exited with code ${code}`
      );
      if (code === 0) {
        console.log(
          `${prefix} Execution for ${companyCode} completed successfully.`
        );
        resolve();
      } else {
        const errorMessage = `${prefix} Execution failed for ${companyCode} with code ${code}.\nStderr: ${stderrData}\nStdout: ${stdoutData}`;
        console.error(errorMessage);
        reject(
          new Error(
            `Helm command failed for ${stepName} (tenant: ${companyCode}) with code ${code}`
          )
        );
      }
    });

    process.on("error", (err) => {
      const errorMessage = `${prefix} Failed to start Helm process for ${companyCode}: ${err.message}`;
      console.error(errorMessage);
      reject(err);
    });
  });
}
// --- End Helm Execution Helper ---

// --- Helper to Wait for Kubernetes Resource Readiness ---
async function waitForResourceReady(
  companyCode: string,
  namespace: string,
  resourceType: "pod" | "deployment" | "statefulset",
  labelSelector: string,
  timeoutSeconds: number = 300 // Default 5 minutes timeout
): Promise<void> {
  const command = "kubectl";
  const condition =
    resourceType === "pod" ? "condition=Ready" : "condition=Available";
  const args = [
    "wait",
    `--namespace=${namespace}`,
    `--for=${condition}`,
    resourceType,
    `-l`,
    labelSelector,
    `--timeout=${timeoutSeconds}s`,
  ];
  const stepName = `wait-${resourceType}-${
    labelSelector.split("=")[1] || "resource"
  }`;
  const prefix = `[kube-wait]`;

  console.log(
    `${prefix} Waiting for ${resourceType} (tenant: ${companyCode}) with selector '${labelSelector}' in namespace ${namespace}... (Timeout: ${timeoutSeconds}s)`
  );
  console.log(`${prefix} Executing: ${command}`, args);

  return new Promise((resolve, reject) => {
    const process = spawn(command, args, {stdio: ["pipe", "pipe", "pipe"]});
    let outputData = ""; // Collect both stdout/stderr

    process.stdout?.on("data", (data) => {
      const output = data.toString();
      outputData += output;
      output
        .split("\n")
        .filter(Boolean)
        .forEach((line: string) => {
          console.log(`${prefix} ${line}`);
        });
    });

    process.stderr?.on("data", (data) => {
      const output = data.toString();
      outputData += output;
      output
        .split("\n")
        .filter(Boolean)
        .forEach((line: string) => {
          console.error(`${prefix} [STDERR] ${line}`);
        });
    });

    process.on("close", (code) => {
      console.log(
        `${prefix} Wait process for ${companyCode} exited with code ${code}`
      );
      if (code === 0) {
        console.log(`${prefix} Resource ready for ${companyCode}.`);
        resolve();
      } else {
        const errorMessage = `${prefix} Wait failed or timed out for ${companyCode} (code ${code}).\nOutput: ${outputData}`;
        console.error(errorMessage);
        reject(
          new Error(
            `Wait for ${resourceType} (tenant: ${companyCode}) with selector ${labelSelector} failed or timed out.`
          )
        );
      }
    });

    process.on("error", (err) => {
      const errorMessage = `${prefix} Failed to start kubectl wait process for ${companyCode}: ${err.message}`;
      console.error(errorMessage);
      reject(err);
    });
  });
}
// --- End Wait Helper ---

// --- Helper to Scale Kubernetes Deployment ---
async function runKubectlScaleCommand(
  companyCode: string, // For logging context
  namespace: string,
  deploymentLabelSelector: string,
  replicas: number
): Promise<void> {
  const command = "kubectl";
  const args = [
    "scale",
    `--namespace=${namespace}`,
    "deployment",
    `-l`,
    deploymentLabelSelector,
    `--replicas=${replicas}`,
  ];
  const stepName = `scale-deployment-${
    deploymentLabelSelector.split("=")[1] || "resource"
  }-to-${replicas}`;
  const prefix = `[kube-scale]`;

  console.log(
    `${prefix} Scaling deployment (tenant: ${companyCode}) with selector '${deploymentLabelSelector}' in namespace ${namespace} to ${replicas} replicas...`
  );
  console.log(`${prefix} Executing: ${command}`, args);

  return new Promise((resolve, reject) => {
    const process = spawn(command, args, {stdio: ["pipe", "pipe", "pipe"]});
    let outputData = ""; // Collect both stdout/stderr

    process.stdout?.on("data", (data) => {
      const output = data.toString();
      outputData += output;
      output
        .split("\n")
        .filter(Boolean)
        .forEach((line: string) => {
          console.log(`${prefix} ${line}`); // Log scale output
        });
    });

    process.stderr?.on("data", (data) => {
      const output = data.toString();
      outputData += output;
      output
        .split("\n")
        .filter(Boolean)
        .forEach((line: string) => {
          console.error(`${prefix} [STDERR] ${line}`);
        });
    });

    process.on("close", (code) => {
      console.log(
        `${prefix} Scale process for ${companyCode} exited with code ${code}`
      );
      // kubectl scale usually returns 0 even if resource not found, but stderr will contain the error
      // We might need more robust error checking based on stderr content if needed.
      if (
        code === 0 &&
        !outputData.toLowerCase().includes("error") &&
        !outputData.toLowerCase().includes("not found")
      ) {
        console.log(
          `${prefix} Scaling for ${companyCode} completed successfully (Code 0).`
        );
        resolve();
      } else {
        const errorMessage = `${prefix} Scaling failed or resource not found for ${companyCode} (code ${code}).\nOutput: ${outputData}`;
        console.error(errorMessage);
        // Check stderr specifically for 'not found' which might not be a critical failure in a stop scenario
        if (outputData.toLowerCase().includes("not found")) {
          console.warn(
            `${prefix} Deployment for scaling not found for ${companyCode}. Assuming already stopped/deleted.`
          );
          resolve(); // Treat 'not found' as success for stopping
        } else {
          reject(
            new Error(
              `kubectl scale command failed for selector ${deploymentLabelSelector} (tenant: ${companyCode}) with code ${code}`
            )
          );
        }
      }
    });

    process.on("error", (err) => {
      const errorMessage = `${prefix} Failed to start kubectl scale process for ${companyCode}: ${err.message}`;
      console.error(errorMessage);
      reject(err);
    });
  });
}
// --- End Scale Helper ---

const kc = new KubeConfig();
// kc.loadFromDefault(); // Load config from default location (~/.kube/config or KUBECONFIG env var)
// --- MODIFIED: Load from cluster if available, otherwise default ---
if (process.env.KUBERNETES_SERVICE_HOST) {
  // We are likely running inside a cluster
  console.log("Loading Kubernetes config from cluster service account...");
  kc.loadFromCluster();
} else {
  // We are likely running outside a cluster (local development)
  console.log("Loading Kubernetes config from default kubeconfig location...");
  kc.loadFromDefault();
}
// --- END MODIFICATION ---
const k8sCoreApi = kc.makeApiClient(CoreV1Api);
const k8sVersionApi = kc.makeApiClient(VersionApi);
const k8sAppsApi = kc.makeApiClient(AppsV1Api);
// --- End Kubernetes Client Setup ---

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Create a PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Initialize Drizzle ORM with the pool and schema
const db = drizzle(pool, {schema});

// Middleware
app.use("*", logger());

// --- Helper Function to Check Deployment/StatefulSet Status ---
interface ServiceStatus {
  status:
    | "healthy"
    | "unhealthy"
    | "degraded"
    | "not_found"
    | "error"
    | "pending"
    | "unavailable";
  readyPods: number;
  totalPods: number;
  errorInfo?: ParsedKubeError | string;
}

async function checkKubeResourceStatus(
  namespace: string,
  releaseName: string,
  resourceType: "deployment" | "statefulset"
): Promise<ServiceStatus> {
  let resource: V1Deployment | V1StatefulSet | undefined;
  const labelSelector = `app.kubernetes.io/instance=${releaseName}`;
  let readyPods = 0;
  let totalPods = 0;

  try {
    if (resourceType === "deployment") {
      const res = await k8sAppsApi.listNamespacedDeployment({
        namespace,
        labelSelector,
      });
      resource = res.items[0]; // Assume one deployment per release name
    } else {
      const res = await k8sAppsApi.listNamespacedStatefulSet({
        namespace,
        labelSelector,
      });
      resource = res.items[0]; // Assume one statefulset per release name
    }

    if (!resource) {
      console.log(
        `Resource ${resourceType} with label ${labelSelector} not found in namespace ${namespace}`
      );
      return {status: "not_found", readyPods: 0, totalPods: 0};
    }

    // Extract replica/pod status
    totalPods = resource.spec?.replicas ?? 0;
    readyPods = resource.status?.readyReplicas ?? 0;
    const currentReplicas = resource.status?.replicas ?? 0;

    if (totalPods === 0) {
      console.warn(
        `Resource ${resourceType} ${releaseName} in ${namespace} has 0 replicas defined.`
      );
      // Consider this healthy if desired replicas is 0, or pending/degraded otherwise?
      // For now, let's call it degraded if spec.replicas is 0 but maybe shouldn't be.
      return {
        status: "degraded",
        readyPods: 0,
        totalPods: 0,
        errorInfo: "Desired replica count is 0",
      };
    }

    if (readyPods === totalPods && currentReplicas === totalPods) {
      return {status: "healthy", readyPods, totalPods};
    } else if (readyPods < totalPods) {
      // Check if it's still progressing or truly stuck/unhealthy
      // Basic check: if readyPods > 0, maybe degraded, if 0, unhealthy?
      if (readyPods > 0) {
        return {
          status: "degraded",
          readyPods,
          totalPods,
          errorInfo: "Some pods are not ready",
        };
      } else {
        return {
          status: "unhealthy",
          readyPods,
          totalPods,
          errorInfo: "No pods are ready",
        };
      }
    } else {
      // Cases like more ready pods than desired? Or mismatch with currentReplicas?
      return {
        status: "degraded",
        readyPods,
        totalPods,
        errorInfo: "Replica status mismatch",
      };
    }
  } catch (error) {
    console.error(
      `Error checking ${resourceType} ${releaseName} in namespace ${namespace}:`,
      error
    );
    const parsedError = parseKubernetesError(error, namespace);
    return {
      status: "error",
      readyPods: 0,
      totalPods: 0,
      errorInfo: parsedError,
    };
  }
}
// --- End Helper Function ---

// --- Refactored Helper Functions for Tenant Health ---

// Custom error class for tenant config issues
class TenantConfigError extends Error {
  constructor(message: string, public statusCode: number = 404) {
    super(message);
    this.name = "TenantConfigError";
  }
}

// 1. Function to get Tenant Configuration
async function getTenantConfig(companyCode: string): Promise<{
  namespace: string;
  pgReleaseName: string;
  backendReleaseName: string;
  frontendReleaseName: string;
}> {
  let tenantConfig;
  try {
    tenantConfig = await db.query.tenants.findFirst({
      where: eq(schema.tenants.companyCode, companyCode),
      columns: {
        namespace: true,
        helmReleaseNames: true, // Fetch the JSON/object column
      },
    });

    // Case 1: Company code itself not found
    if (!tenantConfig) {
      throw new TenantConfigError(
        `Company code ${companyCode} not found in Master DB.`,
        404
      );
    }

    // Case 2: Company code found, but config is incomplete/invalid
    if (
      !tenantConfig.namespace ||
      !tenantConfig.helmReleaseNames ||
      typeof tenantConfig.helmReleaseNames !== "object"
    ) {
      throw new TenantConfigError(
        `Tenant configuration found for ${companyCode}, but namespace or helmReleaseNames object is missing/invalid.`,
        404
      );
    }

    const releases = tenantConfig.helmReleaseNames as any;
    if (
      typeof releases.postgresql === "string" &&
      typeof releases.backendApi === "string" &&
      typeof releases.userFrontend === "string"
    ) {
      // Config is valid, return it
      return {
        namespace: tenantConfig.namespace,
        pgReleaseName: releases.postgresql,
        backendReleaseName: releases.backendApi,
        frontendReleaseName: releases.userFrontend,
      };
    } else {
      // Specific required keys within helmReleaseNames are missing/invalid
      throw new TenantConfigError(
        `Tenant configuration found for ${companyCode}, but required keys (postgresql, backendApi, userFrontend) are missing or invalid within helmReleaseNames.`,
        404
      );
    }
  } catch (dbError) {
    if (dbError instanceof TenantConfigError) throw dbError; // Re-throw specific config errors
    console.error(`Error fetching tenant data for ${companyCode}:`, dbError);
    // Throw a generic internal server error for other DB issues
    throw new Error(
      "Internal error fetching tenant configuration from Master DB."
    );
  }
}

// 2. Function to check Namespace Status
async function checkNamespaceStatus(namespace: string): Promise<{
  status: "exists" | "not_found_in_cluster" | "error";
  errorInfo?: ParsedKubeError;
}> {
  try {
    await k8sCoreApi.readNamespace({name: namespace});
    console.log(`Namespace '${namespace}' exists.`);
    return {status: "exists"};
  } catch (error) {
    console.error(`Failed to read namespace '${namespace}'.`);
    const parsedError = parseKubernetesError(error, namespace);
    const status =
      parsedError.statusCode === 404 ? "not_found_in_cluster" : "error";
    return {status, errorInfo: parsedError};
  }
}

// 3. Function to check status of all services within a tenant namespace
async function checkTenantServicesStatus(
  namespace: string,
  releaseNames: {
    pgReleaseName: string;
    backendReleaseName: string;
    frontendReleaseName: string;
  }
): Promise<{
  postgresql: ServiceStatus;
  backendApi: ServiceStatus;
  userFrontend: ServiceStatus;
}> {
  console.log(`Checking services in namespace '${namespace}'...`);
  const [pgStatus, beStatus, feStatus] = await Promise.all([
    checkKubeResourceStatus(
      namespace,
      releaseNames.pgReleaseName,
      "statefulset"
    ),
    checkKubeResourceStatus(
      namespace,
      releaseNames.backendReleaseName,
      "deployment"
    ),
    checkKubeResourceStatus(
      namespace,
      releaseNames.frontendReleaseName,
      "deployment"
    ),
  ]);
  console.log(`Service checks complete for namespace '${namespace}'.`);
  return {
    postgresql: pgStatus,
    backendApi: beStatus,
    userFrontend: feStatus,
  };
}

// --- Refactored Tenant Health Endpoint (Modified Status Logic for STOPPED state) ---
app.get("/api/health/tenant/:companyCode", async (c) => {
  const companyCode = c.req.param("companyCode").toUpperCase();
  console.log(`Checking health for tenant: ${companyCode}`);

  let config: Awaited<ReturnType<typeof getTenantConfig>> | null = null;
  let nsStatusResult: Awaited<ReturnType<typeof checkNamespaceStatus>> | null =
    null;
  let servicesStatus: Awaited<
    ReturnType<typeof checkTenantServicesStatus>
  > | null = null;
  let statusCode = 200;
  // Define reported status, default to NOT_READY
  let reportedTenantStatus: "READY" | "NOT_READY" | "STOPPED" = "NOT_READY";
  let currentDbStatus: string | null = null; // To store current status from DB

  try {
    // Step 1: Get Tenant Configuration and current DB status
    try {
      const tenantFromDb = await db.query.tenants.findFirst({
        where: eq(schema.tenants.companyCode, companyCode),
        columns: {status: true, namespace: true, helmReleaseNames: true}, // Fetch all needed data
      });
      currentDbStatus = tenantFromDb?.status ?? null;

      // Validate config using getTenantConfig logic (which throws on invalid config)
      // Pass the potentially already fetched data to avoid redundant query if possible
      // Note: getTenantConfig needs adjustment to accept pre-fetched data or we query again.
      // For now, re-querying inside getTenantConfig if needed.
      config = await getTenantConfig(companyCode);
      console.log(
        `Found config for tenant ${companyCode}: namespace='${config.namespace}'`
      );
    } catch (err: any) {
      // Handle errors from getTenantConfig or the initial status query
      if (err instanceof TenantConfigError) {
        statusCode = err.statusCode; // 404
        reportedTenantStatus = "NOT_READY";
        c.status(statusCode as any);
        return c.json({status: reportedTenantStatus, message: err.message});
      } else {
        console.error(
          `Initial DB query or config validation failed for ${companyCode}:`,
          err
        );
        statusCode = 500;
        reportedTenantStatus = "NOT_READY";
        c.status(statusCode as any);
        return c.json({
          status: reportedTenantStatus,
          message: "Internal error fetching tenant data.",
          error: err.message,
        });
      }
    }

    // Step 2: Check Namespace Status
    nsStatusResult = await checkNamespaceStatus(config.namespace);

    // Step 3: Check Services Status (only if namespace exists)
    if (nsStatusResult.status === "exists") {
      servicesStatus = await checkTenantServicesStatus(
        config.namespace,
        config
      );
    } else {
      // Handle unavailable services
      const reason =
        nsStatusResult.status === "not_found_in_cluster"
          ? "Namespace not found"
          : "Namespace check failed";
      const unavailableStatus: ServiceStatus = {
        status: "unavailable",
        readyPods: 0,
        totalPods: 0,
        errorInfo: reason,
      };
      servicesStatus = {
        postgresql: unavailableStatus,
        backendApi: unavailableStatus,
        userFrontend: unavailableStatus,
      };
    }

    // Step 4: Determine Overall Reported Status based on DB status and K8s health
    if (currentDbStatus === STATUS_STOPPED) {
      reportedTenantStatus = "STOPPED";
      // Keep statusCode 200 for STOPPED state even if K8s checks had errors (e.g., namespace not found after stop)
      // An actual error *during* the K8s check itself (caught later) might warrant 500.
      statusCode = 200; // Default to 200 for STOPPED
    } else {
      // DB status is not STOPPED, determine based on K8s health
      const allServicesHealthy =
        servicesStatus?.postgresql?.status === "healthy" &&
        servicesStatus?.backendApi?.status === "healthy" &&
        servicesStatus?.userFrontend?.status === "healthy";

      if (nsStatusResult.status === "exists" && allServicesHealthy) {
        reportedTenantStatus = "READY";
        statusCode = 200;
        // Update DB status to READY if it wasn't already (background)
        if (currentDbStatus !== STATUS_READY) {
          console.log(
            `Health check determined status READY for ${companyCode}, updating DB (was ${currentDbStatus}).`
          );
          updateTenantStatus(companyCode, STATUS_READY).catch((err) => {
            console.error(
              `Background DB status update to READY failed for ${companyCode}:`,
              err
            );
          });
        }
      } else {
        reportedTenantStatus = "NOT_READY";
        // Determine appropriate error code if NOT_READY
        // Keep 200 OK even if namespace/services are not ready/found, as the API call itself succeeded.
        // 5xx should be reserved for internal errors during the check.
        statusCode = 200;
      }
    }
  } catch (error: any) {
    // This outer catch primarily handles unexpected errors now
    console.error(
      `Unhandled error during tenant health check for ${companyCode}:`,
      error
    );
    statusCode = 500;
    reportedTenantStatus = "NOT_READY";
    c.status(statusCode as any);
    return c.json({
      status: reportedTenantStatus,
      message: "Internal server error during health check.",
      error: error.message,
    });
  }

  // Set final status code determined within the try block
  c.status(statusCode as any);

  // Build and return the final JSON response with the determined status
  return c.json({
    status: reportedTenantStatus, // Use READY, NOT_READY, or STOPPED
    companyCode: companyCode,
    checkedNamespace: config?.namespace ?? null,
    namespaceStatus: nsStatusResult?.status ?? "unknown",
    services: servicesStatus ?? {
      // Default structure
      postgresql: {
        status: "unavailable",
        readyPods: 0,
        totalPods: 0,
        errorInfo: "Pre-check failed",
      },
      backendApi: {
        status: "unavailable",
        readyPods: 0,
        totalPods: 0,
        errorInfo: "Pre-check failed",
      },
      userFrontend: {
        status: "unavailable",
        readyPods: 0,
        totalPods: 0,
        errorInfo: "Pre-check failed",
      },
    },
    ...(nsStatusResult?.status === "error" && {
      kubernetesError: nsStatusResult.errorInfo,
    }),
  });
});

app.get("/api/health/cluster", async (c) => {
  try {
    const versionInfo = await k8sVersionApi.getCode();
    const currentContext = kc.getCurrentContext();
    const cluster = kc.getCurrentCluster();
    const user = kc.getCurrentUser();

    // Log verbose info to console as well
    console.log(
      `Cluster health check successful: Context='${currentContext}', Server='${cluster?.server}', User='${user?.name}', Version='${versionInfo.gitVersion}'`
    );

    return c.json({
      status: "ok",
      message: "Connected to Kubernetes cluster",
      clusterVersion: versionInfo.gitVersion,
      // Add more verbose information
      context: currentContext,
      clusterServer: cluster?.server, // Use optional chaining in case cluster is null
      user: user?.name, // Use optional chaining in case user is null
    });
  } catch (error) {
    console.error("Failed to get Kubernetes cluster info:", error);
    // Type guard for error message
    const errorMessage = error instanceof Error ? error.message : String(error);
    return c.json(
      {
        status: "error",
        message: "Failed to connect to Kubernetes cluster or get version info",
        error: errorMessage,
      },
      503
    );
  }
});

app.get("/api/config/:companyCode", async (c) => {
  const companyCode = c.req.param("companyCode").toUpperCase(); // Ensure consistent casing
  console.log(`Fetching config for company code: ${companyCode}`);

  try {
    // Fetch data from the 'tenants' table using Drizzle
    const tenantData = await db.query.tenants.findFirst({
      where: eq(schema.tenants.companyCode, companyCode),
      columns: {
        // Select only necessary columns
        companyCode: true,
        companyLogoUrl: true,
      },
    });

    if (!tenantData) {
      return c.json({error: "Tenant configuration not found"}, 404);
    }

    // Rename fields to match expected frontend format if needed
    const response = {
      company_code: tenantData.companyCode,
      logo_url: tenantData.companyLogoUrl,
    };

    return c.json(response);
  } catch (error) {
    console.error(
      `Error fetching tenant configuration for ${companyCode}:`,
      error
    );
    return c.json({error: "Error fetching tenant configuration"}, 500);
  }
});

// --- NEW Tenant Deployment Endpoint ---
app.post("/api/tenants/:companyCode/deploy", async (c) => {
  const companyCode = c.req.param("companyCode").toUpperCase();
  console.log(`Deployment requested for tenant: ${companyCode}`);

  // --- ADDED LOG ---
  console.log(`>>> Triggering background deployment for ${companyCode}...`);
  // --- END ADDED LOG ---
  deployTenantInBackground(companyCode);

  // Return 202 Accepted immediately
  c.status(202);
  return c.json({
    status: "PENDING",
    message: `Tenant deployment initiated for ${companyCode}. Monitor server logs for progress.`,
  });
});

// --- Background Deployment Logic (Modified with DB Status Updates) ---
// Helper function to parse image string into repo and tag
function parseImage(
  imageString: string | undefined
): {repository: string; tag: string} | null {
  if (!imageString) return null;
  const lastColonIndex = imageString.lastIndexOf(":");
  if (
    lastColonIndex === -1 ||
    lastColonIndex === 0 ||
    lastColonIndex === imageString.length - 1
  ) {
    // Invalid format or tag is missing
    console.error(
      `[parseImage] Invalid image format or missing tag: ${imageString}`
    );
    return null;
  }
  return {
    repository: imageString.substring(0, lastColonIndex),
    tag: imageString.substring(lastColonIndex + 1),
  };
}

async function deployTenantInBackground(companyCode: string) {
  // --- ADDED LOG ---
  console.log(
    `>>> deployTenantInBackground function started for ${companyCode}`
  );
  // --- END ADDED LOG ---
  let config: Awaited<ReturnType<typeof getTenantConfig>> | null = null;

  await updateTenantStatus(companyCode, STATUS_PENDING);
  console.log(
    `Deployment process started for ${companyCode}: Fetching tenant configuration...`
  );

  try {
    config = await getTenantConfig(companyCode);
    const {namespace, pgReleaseName, backendReleaseName, frontendReleaseName} =
      config;

    // 1. Deploy PostgreSQL
    await updateTenantStatus(companyCode, STATUS_DEPLOYING_PG);
    const pgArgs = [
      "upgrade",
      "--install",
      pgReleaseName,
      "bitnami/postgresql",
      "--namespace",
      namespace,
      "--create-namespace",
      // TODO: Add any necessary --set values for PostgreSQL (e.g., persistence, resources)
    ];
    await runHelmCommandAndStream(companyCode, pgArgs, "postgresql");
    // Wait for the primary pod (usually index 0)
    await waitForResourceReady(
      companyCode,
      namespace,
      "pod",
      `app.kubernetes.io/instance=${pgReleaseName},app.kubernetes.io/name=postgresql,app.kubernetes.io/component=primary`, // More specific selector for primary pod
      300
    );

    // Determine environment (e.g., via an environment variable) - RESTORED
    const KUBERNETES_ENV = process.env.KUBERNETES_ENV || "kind"; // "kind" or "gke"
    console.log(`[ENV_DETECTION] KUBERNETES_ENV set to: ${KUBERNETES_ENV}`); // RESTORED

    // Get Tenant Image Paths from Env Vars (needed for GKE override)
    const tenantBackendImage = process.env.TENANT_BACKEND_IMAGE; // e.g., "repo/path:tag"
    const tenantFrontendImage = process.env.TENANT_FRONTEND_IMAGE; // e.g., "repo/path:tag"

    // 2. Deploy Backend API (with migration job enabled)
    await updateTenantStatus(companyCode, STATUS_DEPLOYING_BE);

    // --- MODIFIED: Clone repo logic with better logging/error handling ---
    const chartRepoUrl = "https://github.com/jinseok9338/k8s-demo-helm.git";
    const backendChartSubPath = "helm/backend-api";
    const tempChartDir = `/tmp/tenant-charts/${companyCode}`;
    let localBackendChartPath = "";

    // Helper to run spawn and capture output/errors
    const runSpawnAndLog = async (
      logPrefix: string,
      cmd: string,
      args: string[],
      options?: {cwd?: string}
    ): Promise<void> => {
      console.log(
        `${logPrefix} Executing: ${cmd} ${args.join(" ")} ${
          options?.cwd ? `(in ${options.cwd})` : ""
        }`
      );
      return new Promise((resolve, reject) => {
        const process = spawn(cmd, args, {stdio: "pipe", ...options});
        let stdoutData = "";
        let stderrData = "";
        process.stdout?.on("data", (data) => (stdoutData += data.toString()));
        process.stderr?.on("data", (data) => (stderrData += data.toString()));
        process.on("close", (code) => {
          console.log(`${logPrefix} stdout:\n${stdoutData}`);
          if (stderrData) {
            console.error(`${logPrefix} stderr:\n${stderrData}`);
          }
          if (code === 0) {
            console.log(`${logPrefix} Command finished successfully (code 0).`);
            resolve();
          } else {
            console.error(`${logPrefix} Command failed with code ${code}.`);
            reject(
              new Error(
                `Command "${cmd} ${args.join(
                  " "
                )}" failed with code ${code}.\nStderr: ${stderrData}`
              )
            );
          }
        });
        process.on("error", (err) => {
          console.error(`${logPrefix} Failed to start command: ${err.message}`);
          reject(err);
        });
      });
    };

    try {
      console.log(
        `[helm-backend-api] Preparing local chart for tenant ${companyCode}...`
      );

      // Clean up & Create directory
      await runSpawnAndLog("[git-setup]", "rm", ["-rf", tempChartDir]);
      await runSpawnAndLog("[git-setup]", "mkdir", ["-p", tempChartDir]);

      // Clone repo
      await runSpawnAndLog("[git-clone]", "git", [
        "clone",
        "--depth=1",
        "--filter=blob:none",
        "--sparse",
        chartRepoUrl,
        tempChartDir,
      ]);

      // Sparse checkout - RUN INSIDE THE CLONED REPO
      await runSpawnAndLog(
        "[git-sparse]",
        "git",
        ["sparse-checkout", "set", backendChartSubPath],
        {cwd: tempChartDir}
      );

      localBackendChartPath = `${tempChartDir}/${backendChartSubPath}`;
      console.log(
        `[helm-backend-api] Using local chart path: ${localBackendChartPath}`
      );
      // --- END MODIFIED GIT LOGIC ---

      const backendArgs = [
        "upgrade",
        "--install",
        backendReleaseName,
        localBackendChartPath,
        "--namespace",
        namespace,
        "--set",
        `companyCode=${companyCode}`,
        "--set",
        `db.serviceName=${pgReleaseName}`,
        "--set",
        `db.existingSecret=${pgReleaseName}`,
        "--set",
        "migrationJob.enabled=true",
      ];

      // --- RESTORED Conditional backend args ---
      if (KUBERNETES_ENV === "gke") {
        const backendApiHost = `api.${companyCode.toLowerCase()}.jinseok9338.info`;
        // *** ADDED GKE Image Override ***
        const parsedBackendImage = parseImage(tenantBackendImage);
        if (!parsedBackendImage) {
          throw new Error(
            "GKE environment detected, but TENANT_BACKEND_IMAGE env var is missing or invalid."
          );
        }
        console.log(
          `[GKE Override] Setting Backend Image: ${tenantBackendImage}`
        );
        backendArgs.push(
          "--set",
          `image.repository=${parsedBackendImage.repository}`,
          "--set",
          `image.tag=${parsedBackendImage.tag}`,
          "--set",
          `migrationJob.image.repository=${parsedBackendImage.repository}`,
          "--set",
          `migrationJob.image.tag=${parsedBackendImage.tag}`
        );
        // *** END ADDED ***

        backendArgs.push(
          "--set",
          "ingress.type=kubernetes",
          "--set",
          "ingress.kubernetes.enabled=true",
          "--set",
          `ingress.kubernetes.hostname=${backendApiHost}`,
          "--set",
          "ingress.kubernetes.path=/"
        );
      } else {
        // Kind (Traefik)
        const backendApiHostTraefik = `api.${companyCode.toLowerCase()}.localhost`;
        backendArgs.push(
          "--set",
          "ingress.type=traefik",
          "--set",
          "ingress.traefik.ingressRoute.enabled=true",
          "--set",
          `ingress.traefik.ingressRoute.host=${backendApiHostTraefik}`,
          "--set",
          "ingress.traefik.middleware.stripPrefix.enabled=false" // Assuming API root path
        );
      }
      // --- END RESTORED backend args ---

      await runHelmCommandAndStream(companyCode, backendArgs, "backend-api");

      // Wait for the deployment itself (which starts after the migration job succeeds)
      await waitForResourceReady(
        companyCode,
        namespace,
        "deployment",
        `app.kubernetes.io/instance=${backendReleaseName}`,
        180 // Adjust timeout as needed, considering migration time
      );
    } finally {
      // Clean up the cloned repository regardless of success/failure
      console.log(
        `[helm-backend-api] Cleaning up temporary chart directory: ${tempChartDir}`
      );
      // Use the helper function for cleanup as well
      await runSpawnAndLog("[git-cleanup]", "rm", ["-rf", tempChartDir]);
    }

    // 3. Deploy User Frontend
    await updateTenantStatus(companyCode, STATUS_DEPLOYING_FE);

    // --- MODIFIED: Clone repo logic with better logging/error handling for frontend ---
    const frontendChartSubPath = "helm/user-frontend";
    // tempChartDir and runSpawnAndLog are defined above
    let localFrontendChartPath = "";

    try {
      console.log(
        `[helm-user-frontend] Preparing local chart for tenant ${companyCode}...`
      );

      // Clean up & Create directory
      await runSpawnAndLog("[git-setup-fe]", "rm", ["-rf", tempChartDir]);
      await runSpawnAndLog("[git-setup-fe]", "mkdir", ["-p", tempChartDir]);

      // Clone repo
      await runSpawnAndLog("[git-clone-fe]", "git", [
        "clone",
        "--depth=1",
        "--filter=blob:none",
        "--sparse",
        chartRepoUrl,
        tempChartDir,
      ]);

      // Sparse checkout - RUN INSIDE THE CLONED REPO
      await runSpawnAndLog(
        "[git-sparse-fe]",
        "git",
        ["sparse-checkout", "set", frontendChartSubPath],
        {cwd: tempChartDir}
      );

      localFrontendChartPath = `${tempChartDir}/${frontendChartSubPath}`;
      console.log(
        `[helm-user-frontend] Using local chart path: ${localFrontendChartPath}`
      );
      // --- END MODIFIED GIT LOGIC ---

      let frontendHost = "";
      const frontendArgs = [
        "upgrade",
        "--install",
        frontendReleaseName,
        localFrontendChartPath,
        "--namespace",
        namespace,
        "--set",
        `companyCode=${companyCode}`,
      ];

      // --- RESTORED Conditional frontend args (Option B - separate hosts) ---
      if (KUBERNETES_ENV === "gke") {
        frontendHost = `app.${companyCode.toLowerCase()}.jinseok9338.info`;
        // *** ADDED GKE Image Override ***
        const parsedFrontendImage = parseImage(tenantFrontendImage);
        if (!parsedFrontendImage) {
          throw new Error(
            "GKE environment detected, but TENANT_FRONTEND_IMAGE env var is missing or invalid."
          );
        }
        console.log(
          `[GKE Override] Setting Frontend Image: ${tenantFrontendImage}`
        );
        frontendArgs.push(
          "--set",
          `image.repository=${parsedFrontendImage.repository}`,
          "--set",
          `image.tag=${parsedFrontendImage.tag}`
        );
        // *** END ADDED ***

        frontendArgs.push(
          "--set",
          "ingress.type=kubernetes",
          "--set",
          "ingress.kubernetes.enabled=true",
          "--set",
          `ingress.kubernetes.hostname=${frontendHost}`
        );
      } else {
        // Kind (Traefik)
        frontendHost = `app.${companyCode.toLowerCase()}.localhost`;
        frontendArgs.push(
          "--set",
          "ingress.type=traefik",
          // Note: For Option B, Traefik might not need backend/middleware settings here
          // if user-frontend only handles its own host now.
          // Let's assume the user-frontend's ingressRoute template was also simplified.
          // If not, restore the backend/middlewareNamespace sets as needed.
          "--set",
          "ingressRoute.enabled=true", // This path might be wrong, should be ingress.traefik.ingressRoute.enabled based on values?
          "--set",
          `ingressRoute.host=${frontendHost}` // This path might be wrong, should be ingress.traefik.ingressRoute.host? Let's assume old paths for now for simplicity, needs verification with user-frontend chart.
        );
      }
      // --- END RESTORED frontend args ---

      console.log(
        `[helm-user-frontend] Deploying for env: ${KUBERNETES_ENV} with host: ${frontendHost}`
      );
      await runHelmCommandAndStream(companyCode, frontendArgs, "user-frontend");
      await waitForResourceReady(
        companyCode,
        namespace,
        "deployment",
        `app.kubernetes.io/instance=${frontendReleaseName}`,
        180
      );
    } finally {
      // Clean up the cloned repository
      console.log(
        `[helm-user-frontend] Cleaning up temporary chart directory: ${tempChartDir}`
      );
      await runSpawnAndLog("[git-cleanup-fe]", "rm", ["-rf", tempChartDir]);
    }
    // --- End Deployment Sequence ---

    // Final Status: READY
    await updateTenantStatus(companyCode, STATUS_READY);
    console.log(
      `Deployment sequence for ${companyCode} completed successfully!`
    );
  } catch (error: any) {
    console.error(
      `Deployment sequence failed for ${companyCode}:`,
      error.message
    );
    // Final Status: FAILED
    await updateTenantStatus(companyCode, STATUS_FAILED);
    // Error already logged inside helpers
  }
}
// --- End Background Deployment Logic ---

// --- Background Deletion Logic ---
async function deleteTenantInBackground(companyCode: string): Promise<void> {
  console.log(`Deletion process starting for tenant: ${companyCode}`);
  await updateTenantStatus(companyCode, STATUS_DESTROYING);

  let config: Awaited<ReturnType<typeof getTenantConfig>> | null = null;
  let namespace: string | null = null;
  let helmErrorOccurred = false;

  try {
    // 1. Get Tenant Configuration (needed for release names and namespace)
    try {
      config = await getTenantConfig(companyCode);
      namespace = config.namespace;
      console.log(
        `Deletion for ${companyCode}: Found namespace ${namespace} and release names.`
      );
    } catch (error: any) {
      if (error instanceof TenantConfigError && error.statusCode === 404) {
        // If config doesn't exist, maybe it was already deleted or never existed.
        // Consider this a success in terms of the final state (NOT_READY).
        console.log(
          `Deletion for ${companyCode}: Tenant configuration not found, assuming already deleted or never existed.`
        );
        await updateTenantStatus(companyCode, STATUS_NOT_READY);
        return; // Stop the deletion process
      }
      // Rethrow other config errors to be caught by the main catch block
      throw error;
    }

    // Ensure namespace is available
    if (!namespace) {
      throw new Error("Namespace could not be determined from configuration.");
    }

    // 2. Uninstall Helm Releases (Reverse order: Frontend -> Backend -> PG)
    const helmUninstallBaseArgs = ["uninstall", "-n", namespace];

    try {
      console.log(
        `Uninstalling frontend release: ${config.frontendReleaseName}`
      );
      await runHelmCommandAndStream(
        companyCode,
        [...helmUninstallBaseArgs, config.frontendReleaseName],
        "uninstall-fe"
      );
    } catch (helmError: any) {
      const errorMessage = helmError?.message || String(helmError);
      if (errorMessage.includes("release: not found")) {
        console.log(
          `Frontend release ${config.frontendReleaseName} for ${companyCode} not found, considering uninstalled.`
        );
        // Do not set helmErrorOccurred = true for "not found"
      } else {
        console.error(
          `Error uninstalling frontend release for ${companyCode}, proceeding with other steps.`,
          helmError
        );
        helmErrorOccurred = true; // Mark other errors
      }
    }

    try {
      console.log(`Uninstalling backend release: ${config.backendReleaseName}`);
      await runHelmCommandAndStream(
        companyCode,
        [...helmUninstallBaseArgs, config.backendReleaseName],
        "uninstall-be"
      );
    } catch (helmError: any) {
      const errorMessage = helmError?.message || String(helmError);
      if (errorMessage.includes("release: not found")) {
        console.log(
          `Backend release ${config.backendReleaseName} for ${companyCode} not found, considering uninstalled.`
        );
        // Do not set helmErrorOccurred = true
      } else {
        console.error(
          `Error uninstalling backend release for ${companyCode}, proceeding with other steps.`,
          helmError
        );
        helmErrorOccurred = true;
      }
    }

    try {
      console.log(`Uninstalling postgresql release: ${config.pgReleaseName}`);
      await runHelmCommandAndStream(
        companyCode,
        [...helmUninstallBaseArgs, config.pgReleaseName],
        "uninstall-pg"
      );
    } catch (helmError: any) {
      const errorMessage = helmError?.message || String(helmError);
      if (errorMessage.includes("release: not found")) {
        console.log(
          `PostgreSQL release ${config.pgReleaseName} for ${companyCode} not found, considering uninstalled.`
        );
        // Do not set helmErrorOccurred = true
      } else {
        console.error(
          `Error uninstalling postgresql release for ${companyCode}, proceeding with namespace deletion.`,
          helmError
        );
        helmErrorOccurred = true;
      }
    }

    // 3. Delete Namespace
    console.log(`Deleting namespace: ${namespace}`);
    try {
      await k8sCoreApi.deleteNamespace({
        name: namespace,
      } as any);
      console.log(`Namespace ${namespace} deletion initiated.`);
      // Note: Actual deletion is async in K8s. We don't wait here.
    } catch (k8sError: any) {
      // Check if it's a 'NotFound' error (already deleted)
      if (k8sError.response && k8sError.response.statusCode === 404) {
        console.log(`Namespace ${namespace} already deleted or not found.`);
      } else {
        console.error(
          `Error initiating namespace deletion for ${namespace}:`,
          k8sError
        );
        // Decide if this constitutes a full failure
        helmErrorOccurred = true; // Consider namespace deletion failure critical
      }
    }

    // 4. Final Status Update
    if (helmErrorOccurred) {
      console.warn(
        `Deletion process for ${companyCode} completed with errors.`
      );
      await updateTenantStatus(companyCode, STATUS_DELETE_FAILED);
    } else {
      console.log(
        `Deletion process for ${companyCode} completed successfully.`
      );
      await updateTenantStatus(companyCode, STATUS_NOT_READY);
    }
  } catch (error: any) {
    console.error(
      `Tenant deletion process failed critically for ${companyCode}:`,
      error.message
    );
    await updateTenantStatus(companyCode, STATUS_DELETE_FAILED);
  }
}
// --- End Background Deletion Logic ---

// --- NEW Tenant Deletion Endpoint ---
app.delete("/api/tenants/:companyCode", async (c) => {
  const companyCode = c.req.param("companyCode").toUpperCase();
  console.log(`Deletion requested for tenant: ${companyCode}`);

  // Trigger deletion in the background
  deleteTenantInBackground(companyCode);

  // Return 202 Accepted immediately
  c.status(202);
  return c.json({
    status: "DESTROYING", // Indicate deletion is in progress
    message: `Tenant deletion initiated for ${companyCode}. Monitor server logs for progress.`,
  });
});

// --- Background Stopping Logic ---
async function stopTenantServicesInBackground(
  companyCode: string
): Promise<void> {
  console.log(`Stop process starting for tenant: ${companyCode}`);
  await updateTenantStatus(companyCode, STATUS_STOPPING);

  let config: Awaited<ReturnType<typeof getTenantConfig>> | null = null;
  let namespace: string | null = null;
  let scaleErrorOccurred = false;

  try {
    // 1. Get Tenant Configuration (needed for release names and namespace)
    try {
      config = await getTenantConfig(companyCode);
      namespace = config.namespace;
      console.log(
        `Stopping services for ${companyCode}: Found namespace ${namespace} and release names.`
      );
    } catch (error: any) {
      if (error instanceof TenantConfigError && error.statusCode === 404) {
        console.log(
          `Stop for ${companyCode}: Tenant configuration not found, cannot proceed.`
        );
        // Can't proceed without config, mark as failed or leave as is?
        // Let's mark as failed as the stop couldn't be performed.
        await updateTenantStatus(companyCode, STATUS_STOP_FAILED);
        return;
      }
      throw error; // Rethrow other config errors
    }

    if (!namespace) {
      throw new Error("Namespace could not be determined from configuration.");
    }

    // 2. Scale Down Deployments (Frontend and Backend)
    // Use label selectors based on Helm release names
    const backendSelector = `app.kubernetes.io/instance=${config.backendReleaseName}`;
    const frontendSelector = `app.kubernetes.io/instance=${config.frontendReleaseName}`;

    try {
      console.log(
        `Scaling down frontend deployment for ${companyCode} (selector: ${frontendSelector})...`
      );
      await runKubectlScaleCommand(companyCode, namespace, frontendSelector, 0);
    } catch (scaleError) {
      console.error(
        `Error scaling down frontend deployment for ${companyCode}.`,
        scaleError
      );
      scaleErrorOccurred = true;
    }

    try {
      console.log(
        `Scaling down backend deployment for ${companyCode} (selector: ${backendSelector})...`
      );
      await runKubectlScaleCommand(companyCode, namespace, backendSelector, 0);
    } catch (scaleError) {
      console.error(
        `Error scaling down backend deployment for ${companyCode}.`,
        scaleError
      );
      scaleErrorOccurred = true;
    }

    // 3. Final Status Update
    if (scaleErrorOccurred) {
      console.warn(`Stop process for ${companyCode} completed with errors.`);
      await updateTenantStatus(companyCode, STATUS_STOP_FAILED);
    } else {
      console.log(`Stop process for ${companyCode} completed successfully.`);
      await updateTenantStatus(companyCode, STATUS_STOPPED);
    }
  } catch (error: any) {
    console.error(
      `Tenant stop process failed critically for ${companyCode}:`,
      error.message
    );
    await updateTenantStatus(companyCode, STATUS_STOP_FAILED);
  }
}
// --- End Background Stopping Logic ---

// --- NEW Tenant Stop Endpoint ---
app.post("/api/tenants/:companyCode/stop", async (c) => {
  const companyCode = c.req.param("companyCode").toUpperCase();
  console.log(`Stop requested for tenant: ${companyCode}`);

  // Trigger stopping in the background
  stopTenantServicesInBackground(companyCode);

  // Return 202 Accepted immediately
  c.status(202);
  return c.json({
    status: STATUS_STOPPING,
    message: `Tenant service stop initiated for ${companyCode}. Monitor server logs.`,
  });
});

// --- NEW Tenant List Endpoint with Pagination ---
app.get("/api/tenants", async (c) => {
  // Pagination parameters
  const page = parseInt(c.req.query("page") || "1", 10);
  const pageSize = parseInt(c.req.query("pageSize") || "10", 10);

  // Basic validation
  if (isNaN(page) || page < 1) {
    c.status(400);
    return c.json({
      error: "Invalid 'page' parameter. Must be a positive integer.",
    });
  }
  if (isNaN(pageSize) || pageSize < 1) {
    c.status(400);
    return c.json({
      error: "Invalid 'pageSize' parameter. Must be a positive integer.",
    });
  }

  const limit = pageSize;
  const offset = (page - 1) * pageSize;

  try {
    // 1. Get total count of tenants
    const totalCountResult = await db
      .select({count: sql<number>`count(*)`})
      .from(schema.tenants);
    const totalItems = totalCountResult[0]?.count ?? 0;

    // 2. Get paginated tenant list
    const tenantsData = await db.query.tenants.findMany({
      columns: {
        companyCode: true,
        name: true,
        status: true,
        namespace: true,
        // Do not select helmReleaseNames unless needed for URL construction logic later
      },
      orderBy: (tenants, {asc}) => [asc(tenants.companyCode)],
      limit: limit,
      offset: offset,
    });

    // 3. Map data and construct basic access URL
    const tenantsSummary = tenantsData.map((tenant) => ({
      companyCode: tenant.companyCode,
      name: tenant.name,
      status: tenant.status,
      namespace: tenant.namespace,
      // Construct a predictable URL - adjust if pattern is different or stored elsewhere
      accessUrl: tenant.namespace
        ? `http://app.${tenant.companyCode.toLowerCase()}.localhost`
        : null,
    }));

    // 4. Calculate pagination metadata
    const totalPages = Math.ceil(totalItems / pageSize);

    // 5. Return response
    return c.json({
      tenants: tenantsSummary,
      pagination: {
        currentPage: page,
        pageSize: pageSize,
        totalItems: totalItems,
        totalPages: totalPages,
      },
    });
  } catch (error: any) {
    console.error("Error fetching tenant list:", error);
    c.status(500);
    return c.json({
      error: "Internal server error fetching tenant list.",
      details: error.message,
    });
  }
});

// --- Background Starting Logic ---
async function startTenantServicesInBackground(
  companyCode: string
): Promise<void> {
  console.log(`Start process starting for tenant: ${companyCode}`);
  await updateTenantStatus(companyCode, STATUS_STARTING);

  let config: Awaited<ReturnType<typeof getTenantConfig>> | null = null;
  let namespace: string | null = null;
  let scaleErrorOccurred = false;
  let waitErrorOccurred = false;

  try {
    // 1. Get Tenant Configuration
    try {
      config = await getTenantConfig(companyCode);
      namespace = config.namespace;
      console.log(
        `Starting services for ${companyCode}: Found namespace ${namespace} and release names.`
      );
    } catch (error: any) {
      if (error instanceof TenantConfigError && error.statusCode === 404) {
        console.log(
          `Start for ${companyCode}: Tenant configuration not found, cannot proceed.`
        );
        await updateTenantStatus(companyCode, STATUS_START_FAILED); // Mark as failed if config missing
        return;
      }
      throw error; // Rethrow other config errors
    }

    if (!namespace) {
      throw new Error("Namespace could not be determined from configuration.");
    }

    // 2. Scale Up Deployments (Backend and Frontend to 1 replica)
    const backendSelector = `app.kubernetes.io/instance=${config.backendReleaseName}`;
    const frontendSelector = `app.kubernetes.io/instance=${config.frontendReleaseName}`;
    const targetReplicas = 1; // Scale up to 1 replica

    try {
      console.log(
        `Scaling up backend deployment for ${companyCode} (selector: ${backendSelector}) to ${targetReplicas}...`
      );
      await runKubectlScaleCommand(
        companyCode,
        namespace,
        backendSelector,
        targetReplicas
      );
    } catch (scaleError) {
      console.error(
        `Error scaling up backend deployment for ${companyCode}.`,
        scaleError
      );
      scaleErrorOccurred = true;
    }

    try {
      console.log(
        `Scaling up frontend deployment for ${companyCode} (selector: ${frontendSelector}) to ${targetReplicas}...`
      );
      await runKubectlScaleCommand(
        companyCode,
        namespace,
        frontendSelector,
        targetReplicas
      );
    } catch (scaleError) {
      console.error(
        `Error scaling up frontend deployment for ${companyCode}.`,
        scaleError
      );
      scaleErrorOccurred = true;
    }

    // If scaling failed for either, mark as failed and stop
    if (scaleErrorOccurred) {
      console.error(`Start process failed during scaling for ${companyCode}.`);
      await updateTenantStatus(companyCode, STATUS_START_FAILED);
      return;
    }

    // 3. Wait for Deployments to Become Ready
    console.log(
      `Waiting for deployments to become ready after scaling up for ${companyCode}...`
    );
    try {
      await waitForResourceReady(
        companyCode,
        namespace,
        "deployment",
        backendSelector,
        180
      ); // 3 min timeout
      console.log(`Backend deployment ready for ${companyCode}.`);
    } catch (waitError) {
      console.error(
        `Backend deployment did not become ready for ${companyCode}.`,
        waitError
      );
      waitErrorOccurred = true;
    }

    try {
      await waitForResourceReady(
        companyCode,
        namespace,
        "deployment",
        frontendSelector,
        180
      ); // 3 min timeout
      console.log(`Frontend deployment ready for ${companyCode}.`);
    } catch (waitError) {
      console.error(
        `Frontend deployment did not become ready for ${companyCode}.`,
        waitError
      );
      waitErrorOccurred = true;
    }

    // 4. Final Status Update
    if (waitErrorOccurred) {
      console.warn(
        `Start process for ${companyCode} completed, but one or more deployments did not become ready.`
      );
      // Even if wait fails, the scaling happened. Should it be READY or START_FAILED?
      // Let's mark as START_FAILED if readiness check fails.
      await updateTenantStatus(companyCode, STATUS_START_FAILED);
    } else {
      console.log(
        `Start process for ${companyCode} completed successfully. Tenant should be READY.`
      );
      await updateTenantStatus(companyCode, STATUS_READY);
    }
  } catch (error: any) {
    console.error(
      `Tenant start process failed critically for ${companyCode}:`,
      error.message
    );
    // Attempt to update status even if a critical error occurred before the final step
    if (companyCode && !(error instanceof TenantConfigError)) {
      // Avoid double update if config error already set status
      await updateTenantStatus(companyCode, STATUS_START_FAILED);
    }
  }
}
// --- End Background Starting Logic ---

// --- NEW Tenant Start Endpoint ---
app.post("/api/tenants/:companyCode/start", async (c) => {
  const companyCode = c.req.param("companyCode").toUpperCase();
  console.log(`Start requested for tenant: ${companyCode}`);

  // Trigger starting in the background
  startTenantServicesInBackground(companyCode);

  // Return 202 Accepted immediately
  c.status(202);
  return c.json({
    status: STATUS_STARTING,
    message: `Tenant service start initiated for ${companyCode}. Monitor server logs.`,
  });
});

// --- Server Startup --- (Following the provided example)
const port = parseInt(process.env.PORT || "3001", 10);

console.log(`Master Backend server running on port ${port}`);

// 1. Call serve to get the server instance
const server = serve({
  fetch: app.fetch,
  port: port,
});

// The server is already listening due to the serve call
