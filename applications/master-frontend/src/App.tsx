import {BrowserRouter as Router, Routes, Route} from "react-router";
import TenantListPage from "./pages/TenantListPage";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
// import TenantListPage from "./pages/TenantListPage";
import TenantDetailPage from "./pages/TenantDetailPage"; // 나중에 추가
// import CreateTenantPage from './pages/CreateTenantPage'; // 나중에 추가
const queryClient = new QueryClient();
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        {/* shadcn/ui 테마 적용을 위해 최상위에 기본 클래스 추가 */}
        <div className="min-h-screen bg-background text-foreground">
          {/* 필요시 Header 컴포넌트 추가 */}
          {/* <Header /> */}
          <main className="container mx-auto py-8 px-4">
            {" "}
            {/* 컨테이너 및 패딩 */}
            <Routes>
              <Route path="/" element={<TenantListPage />} />
              {/* <Route path="/create" element={<CreateTenantPage />} /> */}
              <Route
                path="/tenants/:companyCode"
                element={<TenantDetailPage />}
              />
              <Route path="*" element={<NotFoundPage />} /> {/* 404 페이지 */}
            </Routes>
          </main>
        </div>
      </Router>
    </QueryClientProvider>
  );
}

function NotFoundPage() {
  return (
    <div className="text-center py-10">
      <h2 className="text-xl font-semibold">404: Page Not Found</h2>
    </div>
  );
}

export default App;
