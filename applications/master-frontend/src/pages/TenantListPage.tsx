// applications/master-frontend/src/pages/TenantListPage.tsx
import {useState} from "react";
import {useQuery, useMutation, useQueryClient} from "@tanstack/react-query"; // Import useMutation, useQueryClient
import {Link} from "react-router"; // Import Link
// import { Link } from 'react-router-dom'; // For linking to detail pages later
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Alert, AlertDescription, AlertTitle} from "@/components/ui/alert";
import {Terminal, RefreshCw} from "lucide-react"; // Add RefreshCw icon

// API 응답 타입 정의 (이전과 동일)
interface TenantSummary {
  companyCode: string;
  name: string;
  status: string;
  namespace: string | null;
  accessUrl: string | null;
}
interface PaginationInfo {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}
interface TenantsApiResponse {
  tenants: TenantSummary[];
  pagination: PaginationInfo;
}

// 상태 표시 Badge variant 결정 함수
type BadgeVariant = "default" | "secondary" | "destructive" | "outline";
function getStatusVariantAndText(status: string): {
  variant: BadgeVariant;
  text: string;
} {
  switch (status) {
    case "READY":
      return {variant: "default", text: "서비스 준비 완료"};
    case "STOPPED":
      return {variant: "secondary", text: "중단됨"};
    case "PENDING":
    case "DEPLOYING_PG":
    case "DEPLOYING_BE":
    case "DEPLOYING_FE":
    case "STOPPING":
    case "DESTROYING":
      return {variant: "outline", text: "처리중"};
    case "FAILED":
    case "DELETE_FAILED":
    case "STOP_FAILED":
      return {variant: "destructive", text: "오류 발생"};
    case "NOT_READY":
    case "UNKNOWN":
    default:
      return {variant: "secondary", text: "확인 필요"};
  }
}

// TanStack Query를 위한 fetch 함수
const fetchTenants = async (
  page: number,
  pageSize: number
): Promise<TenantsApiResponse> => {
  // 환경 변수 사용 제거
  // const backendUrl = import.meta.env.VITE_BACKEND_API_URL;
  // if (!backendUrl) {
  //   throw new Error("VITE_BACKEND_API_URL environment variable is not set.");
  // }
  // const apiUrl = `${backendUrl}/api/tenants?page=${page}&pageSize=${pageSize}`;
  const apiUrl = `/api/tenants?page=${page}&pageSize=${pageSize}`; // Use relative path
  const response = await fetch(apiUrl);
  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(
      `HTTP error! status: ${response.status}, message: ${errorData}`
    );
  }
  return response.json();
};

// --- API 호출 함수들 ---
// getBackendUrl 함수 제거
// const getBackendUrl = (): string => {
//   const url = import.meta.env.VITE_BACKEND_API_URL;
//   if (!url) {
//     throw new Error("VITE_BACKEND_API_URL environment variable is not set.");
//   }
//   return url;
// };

// Deploy (Start) Tenant
const deployTenant = async (companyCode: string): Promise<Response> => {
  // const backendUrl = getBackendUrl();
  const response = await fetch(
    // `${backendUrl}/api/tenants/${companyCode}/deploy`,
    `/api/tenants/${companyCode}/deploy`, // Use relative path
    {
      method: "POST",
    }
  );
  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(
      `Failed to start tenant ${companyCode}: ${response.status} ${errorData}`
    );
  }
  // Return the raw response for potential status checking if needed (e.g., 202)
  return response;
};

// Stop Tenant
const stopTenant = async (companyCode: string): Promise<Response> => {
  // const backendUrl = getBackendUrl();
  const response = await fetch(
    // `${backendUrl}/api/tenants/${companyCode}/stop`,
    `/api/tenants/${companyCode}/stop`, // Use relative path
    {
      method: "POST",
    }
  );
  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(
      `Failed to stop tenant ${companyCode}: ${response.status} ${errorData}`
    );
  }
  return response;
};

// Delete Tenant
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
// --- End API 호출 함수들 ---

export default function TenantListPage() {
  // 페이지 상태는 로컬 UI 상태로 유지
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 10;
  // 폴링/처리 중인 테넌트 추적 - 제거
  // const [processingTenants, setProcessingTenants] = useState<Set<string>>(new Set());

  const queryClient = useQueryClient(); // Query Client 인스턴스

  // useQuery 훅 사용 (refetchInterval 제거)
  const {data, isLoading, isError, error, refetch, isFetching} = useQuery<
    TenantsApiResponse,
    Error
  >({
    queryKey: ["tenants", currentPage, pageSize],
    queryFn: () => fetchTenants(currentPage, pageSize),
    // refetchInterval: processingTenants.size > 0 ? 5000 : false, // 폴링 제거
    // keepPreviousData: true,
    // staleTime: 5000,
  });

  // --- Mutations ---
  const deployMutation = useMutation({
    mutationFn: deployTenant,
    onSuccess: (data, companyCode) => {
      console.log(
        `Tenant ${companyCode} deploy initiated. Status: ${data.status}`
      );
      // 처리 중 상태 추가 로직 제거
      // setProcessingTenants((prev) => new Set(prev).add(companyCode));
      // 즉시 데이터를 한번 무효화하여 PENDING 상태 등을 반영
      queryClient.invalidateQueries({
        queryKey: ["tenants", currentPage, pageSize],
      });
    },
    onError: (error, companyCode) => {
      console.error(`Error deploying tenant ${companyCode}:`, error);
      alert(`테넌트 ${companyCode} 생성 시작 실패: ${error.message}`);
      // 실패 시 처리 중 상태 제거 로직 제거
      // setProcessingTenants((prev) => {
      //   const next = new Set(prev);
      //   next.delete(companyCode);
      //   return next;
      // });
    },
  });

  const stopMutation = useMutation({
    mutationFn: stopTenant,
    onSuccess: (data, companyCode) => {
      console.log(
        `Tenant ${companyCode} stop initiated. Status: ${data.status}`
      );
      // 처리 중 상태 추가 로직 제거
      // setProcessingTenants((prev) => new Set(prev).add(companyCode));
      queryClient.invalidateQueries({
        queryKey: ["tenants", currentPage, pageSize],
      });
    },
    onError: (error, companyCode) => {
      console.error(`Error stopping tenant ${companyCode}:`, error);
      alert(`테넌트 ${companyCode} 중단 실패: ${error.message}`);
      // 실패 시 처리 중 상태 제거 로직 제거
      // setProcessingTenants((prev) => {
      //   const next = new Set(prev);
      //   next.delete(companyCode);
      //   return next;
      // });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTenant,
    onSuccess: (data, companyCode) => {
      console.log(
        `Tenant ${companyCode} delete initiated. Status: ${data.status}`
      );
      // 처리 중 상태 추가 로직 제거
      // setProcessingTenants((prev) => new Set(prev).add(companyCode));
      queryClient.invalidateQueries({
        queryKey: ["tenants", currentPage, pageSize],
      });
    },
    onError: (error, companyCode) => {
      console.error(`Error deleting tenant ${companyCode}:`, error);
      alert(`테넌트 ${companyCode} 삭제 실패: ${error.message}`);
      // 실패 시 처리 중 상태 제거 로직 제거
      // setProcessingTenants((prev) => {
      //   const next = new Set(prev);
      //   next.delete(companyCode);
      //   return next;
      // });
    },
  });
  // --- End Mutations ---

  // data에서 tenants와 pagination 정보 추출
  const tenants = data?.tenants ?? [];
  const pagination = data?.pagination ?? null;

  // --- 폴링 종료 로직 제거 ---
  // useEffect(() => {
  //   if (!data || processingTenants.size === 0) {
  //     return; // 데이터가 없거나 처리 중인 테넌트가 없으면 종료
  //   }
  //
  //   const stillProcessing = new Set<string>();
  //   const newlyFinished: string[] = [];
  //
  //   processingTenants.forEach(companyCode => {
  //     const tenant = data.tenants.find(t => t.companyCode === companyCode);
  //     // 처리 중 상태 목록
  //     const processingStatuses = [
  //         "PENDING", "DEPLOYING_PG", "DEPLOYING_BE", "DEPLOYING_FE",
  //         "STOPPING", "DESTROYING"
  //     ];
  //     if (tenant && processingStatuses.includes(tenant.status)) {
  //         stillProcessing.add(companyCode); // 아직 처리 중이면 유지
  //     } else {
  //         newlyFinished.push(companyCode); // 완료되었으면 목록에 추가
  //     }
  //   });
  //
  //   // 상태 업데이트 (처리 완료된 테넌트 제거)
  //   if (newlyFinished.length > 0) {
  //       console.log("Polling stopped for tenants:", newlyFinished.join(", "));
  //       setProcessingTenants(stillProcessing);
  //   }
  //
  // }, [data, processingTenants]); // data 또는 processingTenants가 변경될 때 실행

  // --- 액션 핸들러 (Mutations 사용) ---
  const handleStart = (companyCode: string) => {
    // 이미 처리 중이면 무시하는 로직 제거 (mutation의 isPending 사용)
    // if (processingTenants.has(companyCode)) return;
    deployMutation.mutate(companyCode);
  };

  const handleStop = (companyCode: string) => {
    // 이미 처리 중이면 무시하는 로직 제거
    // if (processingTenants.has(companyCode)) return;
    stopMutation.mutate(companyCode);
  };

  const handleDelete = (companyCode: string) => {
    // 이미 처리 중이면 무시하는 로직 제거
    // if (processingTenants.has(companyCode)) return;
    if (window.confirm(`${companyCode} 테넌트를 정말 삭제하시겠습니까?`)) {
      deleteMutation.mutate(companyCode);
    }
  };

  const handleCreate = () => {
    alert("TODO: Navigate to create tenant page");
  };
  // 새로고침 핸들러는 refetch 호출
  const handleRefresh = () => {
    refetch();
  };
  // --- 페이지네이션 핸들러 ---
  const handlePreviousPage = () => {
    if (pagination && pagination.currentPage > 1) {
      setCurrentPage(pagination.currentPage - 1);
    }
  };
  const handleNextPage = () => {
    if (pagination && pagination.currentPage < pagination.totalPages) {
      setCurrentPage(pagination.currentPage + 1);
    }
  };

  // --- UI 렌더링 ---
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">테넌트 대시보드</h1>
        <div className="flex space-x-2">
          {/* 새로고침 버튼에 isFetching 상태 반영 */}
          <Button
            onClick={handleRefresh}
            variant="outline"
            disabled={isFetching}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
            />
            새로고침
          </Button>
          <Button onClick={handleCreate}>새 테넌트 생성</Button>
        </div>
      </div>

      {/* isError 상태 사용 */}
      {isError && error && (
        <Alert variant="destructive">
          <Terminal className="h-4 w-4" />
          <AlertTitle>오류</AlertTitle>
          <AlertDescription>{`테넌트 데이터 로드 실패: ${error.message}`}</AlertDescription>
        </Alert>
      )}

      <div className="border rounded-lg">
        <Table>
          {/* isLoading 상태 사용 */}
          <TableCaption>
            {isLoading
              ? "테이블 로딩 중..."
              : pagination && pagination.totalItems > 0
              ? "테넌트 목록"
              : "표시할 테넌트가 없습니다."}
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">회사 코드</TableHead>
              <TableHead>회사명</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>네임스페이스</TableHead>
              <TableHead className="text-right">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* isLoading 상태에 따라 로딩 표시 */}
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <RefreshCw className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : // 로딩 완료 후 데이터 렌더링
            tenants.length > 0 ? (
              tenants.map((tenant) => {
                const {variant, text} = getStatusVariantAndText(tenant.status);
                // const isProcessing = [
                //   "PENDING",
                //   "DEPLOYING_PG",
                //   "DEPLOYING_BE",
                //   "DEPLOYING_FE",
                //   "STOPPING",
                //   "DESTROYING",
                // ].includes(tenant.status);
                const isStopped = tenant.status === "STOPPED";
                const isReady = tenant.status === "READY"; // READY 상태 추가
                // 현재 뮤테이션이 실행 중인지 또는 폴링 중인지 확인
                // const isCurrentlyProcessing = false; // 제거됨

                // 버튼 비활성화 조건 계산
                const isDeploying =
                  deployMutation.isPending &&
                  deployMutation.variables === tenant.companyCode;
                const isStopping =
                  stopMutation.isPending &&
                  stopMutation.variables === tenant.companyCode;
                const isDeleting =
                  deleteMutation.isPending &&
                  deleteMutation.variables === tenant.companyCode;
                const isAnyMutationPendingForThisTenant =
                  isDeploying || isStopping || isDeleting;

                // 처리 중 상태인지 확인 (API 정의된 상태 기준)
                const isProcessingStatus = [
                  "PENDING",
                  "DEPLOYING_PG",
                  "DEPLOYING_BE",
                  "DEPLOYING_FE",
                  "STOPPING",
                  "DESTROYING",
                ].includes(tenant.status);

                return (
                  <TableRow key={tenant.companyCode}>
                    <TableCell className="font-medium">
                      <Link
                        to={`/tenants/${tenant.companyCode}`}
                        className="hover:underline"
                      >
                        {tenant.companyCode}
                      </Link>
                    </TableCell>
                    <TableCell>{tenant.name || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={variant}>{text}</Badge>
                    </TableCell>
                    <TableCell>{tenant.namespace || "-"}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStop(tenant.companyCode)}
                        disabled={
                          isProcessingStatus ||
                          isStopped ||
                          isAnyMutationPendingForThisTenant
                        }
                      >
                        중단
                      </Button>
                      {/* 생성(Start) 버튼 추가 */}
                      <Button
                        variant="default" // Primary action style
                        size="sm"
                        onClick={() => handleStart(tenant.companyCode)}
                        // 조건: 처리중 상태 아니고, READY 상태 아니고, STOPPED 상태일 때만 활성, 뮤테이션 진행 중 아닐 때
                        // disabled={isProcessingStatus || isReady || !isStopped || isAnyMutationPendingForThisTenant}
                        // 수정된 조건: (STOPPED 또는 NOT_READY 상태가 아니거나), READY 상태이거나, 처리중 상태이거나, 뮤테이션 진행 중이면 비활성화
                        disabled={
                          !(isStopped || tenant.status === "NOT_READY") ||
                          isReady ||
                          isProcessingStatus ||
                          isAnyMutationPendingForThisTenant
                        }
                      >
                        생성
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(tenant.companyCode)}
                        disabled={
                          isProcessingStatus ||
                          isAnyMutationPendingForThisTenant
                        }
                      >
                        삭제
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              // 데이터 없을 때 메시지 (TableCaption과 중복될 수 있으나 명시적 표시)
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  표시할 테넌트가 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls */}
      {pagination && pagination.totalPages > 1 && !isLoading && (
        <div className="flex items-center justify-end space-x-2 py-4">
          <div className="flex-1 text-sm text-muted-foreground">
            총 {pagination.totalItems}개 중 {tenants.length}개 표시 (페이지{" "}
            {pagination.currentPage}/{pagination.totalPages})
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreviousPage}
            disabled={pagination.currentPage === 1 || isFetching} // fetching 중 비활성화
          >
            이전
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextPage}
            disabled={
              pagination.currentPage === pagination.totalPages || isFetching
            } // fetching 중 비활성화
          >
            다음
          </Button>
        </div>
      )}
    </div>
  );
}
