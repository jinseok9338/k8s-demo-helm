// eslint-disable-next-line @typescript-eslint/ban-ts-comment
//@ts-nocheck
import {useParams, useNavigate} from "react-router";
import {useQuery, useMutation, useQueryClient} from "@tanstack/react-query";
import {Button} from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Alert, AlertDescription, AlertTitle} from "@/components/ui/alert";
import {Terminal, RefreshCw, ArrowLeft} from "lucide-react";

// --- API 응답 타입 정의 (백엔드의 /api/health/tenant/:companyCode 응답 기준) ---
interface ServiceStatusDetail {
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
  errorInfo?: string | Record<string, unknown>; // Use a more specific type than any
}

interface TenantHealthResponse {
  status: "READY" | "NOT_READY" | "STOPPED"; // Overall status reported
  companyCode: string;
  checkedNamespace: string | null;
  namespaceStatus: "exists" | "not_found_in_cluster" | "error" | "unknown";
  services: {
    postgresql: ServiceStatusDetail;
    backendApi: ServiceStatusDetail;
    userFrontend: ServiceStatusDetail;
  };
  kubernetesError?: string | Record<string, unknown>; // Use a more specific type than any
}

// --- API 호출 함수 ---
const fetchTenantHealth = async (
  companyCode: string
): Promise<TenantHealthResponse> => {
  // const backendUrl = import.meta.env.VITE_BACKEND_API_URL;
  // if (!backendUrl) {
  //   throw new Error("VITE_BACKEND_API_URL environment variable is not set.");
  // }
  // const apiUrl = `${backendUrl}/api/health/tenant/${companyCode}`;
  const apiUrl = `/api/health/tenant/${companyCode}`; // Use relative path
  const response = await fetch(apiUrl);

  if (!response.ok) {
    // Attempt to parse error response for better messages
    let errorData: {message?: string; details?: string} = {
      message: `HTTP error! Status: ${response.status}`,
    }; // More specific type
    try {
      const jsonError = await response.json();
      errorData = jsonError; // Use the structured error if available
    } catch (jsonParseError) {
      // Give error variable a name
      // If JSON parsing fails, use text
      console.warn("Failed to parse error response as JSON:", jsonParseError);
      try {
        errorData.details = await response.text();
      } catch (textReadError) {
        /* Ignore further errors */
        console.warn("Failed to read error response as text:", textReadError);
      }
    }
    // Construct a more informative error message
    throw new Error(
      `Failed to fetch tenant health for ${companyCode}. Status: ${
        response.status
      }. ${errorData.message || ""} ${errorData.details || ""}`.trim()
    );
  }
  return response.json();
};

// --- API 호출 함수들 (TenantListPage와 동일 - 추후 분리 고려) ---
// getBackendUrl 함수 제거
// const getBackendUrl = (): string => {
//   const url = import.meta.env.VITE_BACKEND_API_URL;
//   if (!url) {
//     throw new Error("VITE_BACKEND_API_URL environment variable is not set.");
//   }
//   return url;
// };

const deployTenant = async (companyCode: string): Promise<Response> => {
  // const backendUrl = getBackendUrl();
  const response = await fetch(
    // `${backendUrl}/api/tenants/${companyCode}/deploy`,
    `/api/tenants/${companyCode}/deploy`, // Use relative path
    {method: "POST"}
  );
  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(
      `Failed to start tenant ${companyCode}: ${response.status} ${errorData}`
    );
  }
  return response;
};

const stopTenant = async (companyCode: string): Promise<Response> => {
  // const backendUrl = getBackendUrl();
  const response = await fetch(
    // `${backendUrl}/api/tenants/${companyCode}/stop`,
    `/api/tenants/${companyCode}/stop`, // Use relative path
    {method: "POST"}
  );
  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(
      `Failed to stop tenant ${companyCode}: ${response.status} ${errorData}`
    );
  }
  return response;
};

const deleteTenant = async (companyCode: string): Promise<Response> => {
  // const backendUrl = getBackendUrl();
  const response = await fetch(
    // `${backendUrl}/api/tenants/${companyCode}`,
    `/api/tenants/${companyCode}`, // Use relative path
    {
      method: "DELETE",
    }
  );
  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(
      `Failed to delete tenant ${companyCode}: ${response.status} ${errorData}`
    );
  }
  return response;
};

// --- Start Tenant ---
const startTenant = async (companyCode: string): Promise<Response> => {
  // const backendUrl = getBackendUrl();
  const response = await fetch(
    // `${backendUrl}/api/tenants/${companyCode}/start`,
    `/api/tenants/${companyCode}/start`, // Use relative path
    {method: "POST"}
  );
  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(
      `Failed to start tenant ${companyCode}: ${response.status} ${errorData}`
    );
  }
  return response;
};

// --- End API 호출 함수들 ---

export default function TenantDetailPage() {
  const {companyCode} = useParams<{companyCode: string}>();
  const navigate = useNavigate();
  const queryClient = useQueryClient(); // Use query client for invalidation

  // Moved useQuery outside the conditional check for companyCode
  const {
    data: healthData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<TenantHealthResponse, Error>({
    // Enable/disable the query based on companyCode presence
    queryKey: ["tenantHealth", companyCode],
    queryFn: () => fetchTenantHealth(companyCode!), // Use non-null assertion, as it's checked below
    enabled: !!companyCode, // Only run the query if companyCode exists
    // staleTime: 5000, // Optional: Keep data fresh for 5 seconds
    refetchOnWindowFocus: false, // Optional: Prevent refetch on window focus
  });

  // --- Mutations (for detail page actions) ---
  const deployMutation = useMutation({
    mutationFn: deployTenant,
    onSuccess: (data, mutatedCompanyCode) => {
      console.log(
        `Tenant ${mutatedCompanyCode} deploy initiated. Status: ${data.status}`
      );
      // Invalidate the health query to refresh the detail page
      queryClient.invalidateQueries({
        queryKey: ["tenantHealth", mutatedCompanyCode],
      });
      // Optionally invalidate list query if needed
      // queryClient.invalidateQueries({ queryKey: ["tenants"] });
    },
    onError: (error, mutatedCompanyCode) => {
      console.error(`Error deploying tenant ${mutatedCompanyCode}:`, error);
      alert(`테넌트 ${mutatedCompanyCode} 생성 시작 실패: ${error.message}`);
    },
  });

  // --- Start Mutation ---
  const startMutation = useMutation({
    mutationFn: startTenant,
    onSuccess: (data, mutatedCompanyCode) => {
      console.log(
        `Tenant ${mutatedCompanyCode} start initiated. Status: ${data.status}`
      );
      queryClient.invalidateQueries({
        queryKey: ["tenantHealth", mutatedCompanyCode],
      });
    },
    onError: (error, mutatedCompanyCode) => {
      console.error(`Error starting tenant ${mutatedCompanyCode}:`, error);
      alert(`테넌트 ${mutatedCompanyCode} 복원 실패: ${error.message}`);
    },
  });

  const stopMutation = useMutation({
    mutationFn: stopTenant,
    onSuccess: (data, mutatedCompanyCode) => {
      console.log(
        `Tenant ${mutatedCompanyCode} stop initiated. Status: ${data.status}`
      );
      queryClient.invalidateQueries({
        queryKey: ["tenantHealth", mutatedCompanyCode],
      });
      // queryClient.invalidateQueries({ queryKey: ["tenants"] });
    },
    onError: (error, mutatedCompanyCode) => {
      console.error(`Error stopping tenant ${mutatedCompanyCode}:`, error);
      alert(`테넌트 ${mutatedCompanyCode} 중단 실패: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTenant,
    onSuccess: (data, mutatedCompanyCode) => {
      console.log(
        `Tenant ${mutatedCompanyCode} delete initiated. Status: ${data.status}`
      );
      queryClient.invalidateQueries({
        queryKey: ["tenantHealth", mutatedCompanyCode],
      });
      // After deletion, maybe navigate back to list? Or show a message?
      // navigate("/"); // Example: Navigate back to list
      alert(
        `테넌트 ${mutatedCompanyCode} 삭제 작업이 시작되었습니다. 목록 페이지에서 상태를 확인하세요.`
      );
      // Optionally invalidate list query
      queryClient.invalidateQueries({queryKey: ["tenants"]});
      // Consider navigating back after a short delay or based on status
      navigate(-1); // Go back immediately for this example
    },
    onError: (error, mutatedCompanyCode) => {
      console.error(`Error deleting tenant ${mutatedCompanyCode}:`, error);
      alert(`테넌트 ${mutatedCompanyCode} 삭제 실패: ${error.message}`);
    },
  });
  // --- End Mutations ---

  // Check for companyCode after hooks are called
  if (!companyCode) {
    return (
      <Alert variant="destructive">
        <Terminal className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Company code not found in URL.</AlertDescription>
      </Alert>
    );
  }

  const handleRefresh = () => {
    refetch();
  };

  const handleGoBack = () => {
    navigate(-1); // Go back to the previous page (likely the list)
  };

  // --- Action Handlers ---
  const handleStart = () => {
    if (!companyCode) return;
    startMutation.mutate(companyCode);
  };
  const handleDeploy = () => {
    if (!companyCode) return;
    deployMutation.mutate(companyCode);
  };
  const handleStop = () => {
    if (!companyCode) return;
    stopMutation.mutate(companyCode);
  };
  const handleDelete = () => {
    if (!companyCode) return;
    if (window.confirm(`${companyCode} 테넌트를 정말 삭제하시겠습니까?`)) {
      deleteMutation.mutate(companyCode);
    }
  };

  // --- Helper to render service status ---

  const renderServiceStatus = (
    serviceName: string,
    status: ServiceStatusDetail | undefined
  ) => {
    if (!status) {
      return <Badge variant="secondary">Unknown</Badge>;
    }

    let variant: "default" | "secondary" | "destructive" | "outline" =
      "secondary";
    let text = status.status.toUpperCase();

    switch (status.status) {
      case "healthy":
        variant = "default";
        text = "Healthy";
        break;
      case "unhealthy":
      case "error":
        variant = "destructive";
        text = status.status === "error" ? "Error" : "Unhealthy";
        break;
      case "degraded":
      case "pending":
      case "unavailable":
        variant = "outline";
        text = status.status.charAt(0).toUpperCase() + status.status.slice(1);
        break;
      case "not_found":
        variant = "secondary";
        text = "Not Found";
        break;
    }

    return (
      <div>
        <Badge variant={variant}>{text}</Badge>
        {status.status !== "not_found" && status.status !== "unavailable" && (
          <span className="text-sm text-muted-foreground ml-2">
            ({status.readyPods}/{status.totalPods} Pods Ready)
          </span>
        )}
        {/* Display simple error string or stringified JSON */}
        {status.errorInfo && (
          <p className="text-xs text-red-600 mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap break-words">
            {
              typeof status.errorInfo === "string"
                ? status.errorInfo
                : JSON.stringify(
                    status.errorInfo,
                    null,
                    2
                  ) /* Keep stringify, add formatting */
            }
          </p>
        )}
      </div>
    );
  };

  // --- Helper to render overall status badge ---
  const getOverallStatusVariantAndText = (
    status: string | undefined
  ): {variant: "default" | "secondary" | "destructive"; text: string} => {
    switch (status) {
      case "READY":
        return {variant: "default", text: "Ready"};
      case "STOPPED":
        return {variant: "secondary", text: "Stopped"};
      case "NOT_READY":
        return {variant: "destructive", text: "Not Ready"};
      default:
        return {variant: "secondary", text: "Unknown"};
    }
  };

  const {variant: overallVariant, text: overallText} =
    getOverallStatusVariantAndText(healthData?.status);

  // --- Button Disabling Logic ---
  // Check if any mutation is pending for *this* tenant
  const isAnyMutationPending =
    deployMutation.isPending ||
    startMutation.isPending ||
    stopMutation.isPending ||
    deleteMutation.isPending;

  // Check current overall status from health data
  const isReady = healthData?.status === "READY";
  const isStopped = healthData?.status === "STOPPED";
  const isNotReady = healthData?.status === "NOT_READY";
  // Add other potential failure/intermediate states that might allow deploy
  const isFailedState = [
    "FAILED",
    "STOP_FAILED",
    "START_FAILED",
    "DELETE_FAILED",
    // Add UNKNOWN? Requires clarification.
  ].includes(healthData?.status || "");

  // Determine if the tenant is in a state considered "processing" based on Kubernetes object status
  // This is an approximation, as the overall status might lag.
  // We primarily rely on the overall reported status (`READY`, `STOPPED`, `NOT_READY`)
  // but can also check if individual services are in intermediate states if needed.
  /* // Kept for reference if more granular checks are needed later
  const isProcessingBasedOnServices = (
        healthData?.services?.postgresql?.status === 'pending' ||
        healthData?.services?.backendApi?.status === 'pending' ||
        healthData?.services?.userFrontend?.status === 'pending' ||
        // Add other intermediate statuses from K8s checks if available/relevant
        false
    );
    */
  // For simplicity, let's primarily use the main status for disabling logic
  // but keep isProcessingBasedOnServices if more granularity is needed later.

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <Button variant="outline" size="icon" onClick={handleGoBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">
            Tenant Details: {companyCode.toUpperCase()}
          </h1>
          {healthData?.status && (
            <Badge variant={overallVariant}>{overallText}</Badge>
          )}
        </div>

        <Button onClick={handleRefresh} variant="outline" disabled={isFetching}>
          <RefreshCw
            className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* Add Action Buttons */}
      <div className="flex space-x-2">
        <Button
          variant="default"
          size="sm"
          onClick={handleDeploy}
          // Enable when NOT_READY or in a recoverable FAILED state, and no mutation pending.
          disabled={
            !(isNotReady || isFailedState) ||
            isReady ||
            isStopped ||
            isAnyMutationPending ||
            isLoading
          }
        >
          생성 (Deploy)
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleStart}
          // Enable only when STOPPED and no mutation is pending
          disabled={!isStopped || isAnyMutationPending || isLoading}
        >
          복원 (Start)
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleStop}
          // Enable only when READY and no mutation pending
          disabled={!isReady || isAnyMutationPending || isLoading}
        >
          중단 (Stop)
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDelete}
          // Enable unless a mutation is already pending (can delete from most states, but confirm business logic)
          disabled={isAnyMutationPending || isLoading}
        >
          삭제 (Delete)
        </Button>
      </div>

      {isError && error && (
        <Alert variant="destructive">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Error Loading Tenant Health</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex justify-center items-center h-40">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : healthData ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Namespace</CardTitle>
              <CardDescription>Kubernetes namespace status</CardDescription>
            </CardHeader>
            <CardContent>
              <p>
                Namespace:{" "}
                <strong>{healthData.checkedNamespace || "N/A"}</strong>
              </p>
              <p>
                Status:{" "}
                <Badge
                  variant={
                    healthData.namespaceStatus === "exists"
                      ? "default"
                      : "destructive"
                  }
                >
                  {healthData.namespaceStatus}
                </Badge>
              </p>
              {healthData.namespaceStatus === "error" &&
                healthData.kubernetesError && (
                  <Alert variant="destructive" className="mt-2">
                    <Terminal className="h-4 w-4" />
                    <AlertTitle>Namespace Error</AlertTitle>
                    <AlertDescription className="max-h-40 overflow-y-auto text-xs whitespace-pre-wrap break-words">
                      {
                        typeof healthData.kubernetesError === "string"
                          ? healthData.kubernetesError
                          : JSON.stringify(
                              healthData.kubernetesError,
                              null,
                              2
                            ) /* Keep stringify, add formatting */
                      }
                    </AlertDescription>
                  </Alert>
                )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>PostgreSQL</CardTitle>
              <CardDescription>Database service status</CardDescription>
            </CardHeader>
            <CardContent>
              {renderServiceStatus(
                "PostgreSQL",
                healthData.services?.postgresql
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Backend API</CardTitle>
              <CardDescription>Tenant backend service status</CardDescription>
            </CardHeader>
            <CardContent>
              {renderServiceStatus(
                "Backend API",
                healthData.services?.backendApi
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>User Frontend</CardTitle>
              <CardDescription>Tenant frontend service status</CardDescription>
            </CardHeader>
            <CardContent>
              {renderServiceStatus(
                "User Frontend",
                healthData.services?.userFrontend
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        !isError && <p>No health data available.</p> // Should not happen if no error and not loading, but as fallback
      )}
    </div>
  );
}
