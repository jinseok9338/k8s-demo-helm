# Day 3: Tenant Dashboard POC Enhancements

## Overview

This document summarizes the key features and improvements implemented for the Tenant Dashboard POC during this session. The focus was on refining the UI/UX, implementing core tenant lifecycle actions (start, stop, delete, deploy), creating a detailed view page, and adjusting backend API behavior.

## Key Changes & Features

### 1. Backend API (`applications/master-backend/src/index.ts`)

- **CORS Fix:** Resolved CORS errors by explicitly allowing requests from the frontend development server (`http://localhost:5173`) using the `hono/cors` middleware with `origin: "*"`.
- **Tenant Health Endpoint (`GET /api/health/tenant/:companyCode`)**:
  - Modified the endpoint to consistently return `HTTP 200 OK` even if the tenant's Kubernetes resources (namespace, services) are not found or in a non-ready state (`NOT_READY`, `STOPPED`). The response body accurately reflects the tenant's status.
  - `HTTP 5xx` status codes are now reserved for unexpected internal server errors during the health check process itself (e.g., database connection issues, critical errors fetching K8s info).
- **Tenant Restore/Start Functionality**:
  - Added new status constants `STATUS_STARTING` and `STATUS_START_FAILED`.
  - Implemented a background function `startTenantServicesInBackground` to handle tenant restoration:
    - Scales up the Backend API deployment replicas to 1.
    - Waits for the Backend API deployment to become ready.
    - Scales up the User Frontend deployment replicas to 1 (only after the backend is ready).
    - Waits for the User Frontend deployment to become ready.
    - Updates the tenant status in the database (`STARTING` -> `READY` or `START_FAILED`).
    - **Note:** PostgreSQL (StatefulSet) is intentionally not scaled down during the "Stop" operation, so it doesn't need to be scaled up during "Start". This sequential startup (Backend then Frontend) was confirmed to be the existing logic.
  - Added a new API endpoint `POST /api/tenants/:companyCode/start` to trigger this background process.

### 2. Tenant List Page (`applications/master-frontend/src/pages/TenantListPage.tsx`)

- **TanStack Query Integration:** Fully integrated `@tanstack/react-query` for managing server state:
  - `useQuery` fetches the tenant list (`/api/tenants`).
  - `useMutation` handles Deploy, Stop, and Delete actions, calling the respective backend APIs (`POST /deploy`, `POST /stop`, `DELETE /`).
  - Mutations automatically invalidate the tenant list query on success to reflect intermediate status changes (e.g., `PENDING`, `STOPPING`).
- **Action Buttons & Logic:**
  - Added "생성 (Deploy)" button.
  - Implemented robust disabling logic for "생성", "중단", "삭제" buttons based on the current tenant status (`READY`, `STOPPED`, `NOT_READY`, `FAILED_*` etc.) and whether a relevant mutation is currently pending for that specific tenant.
  - "생성 (Deploy)" is enabled for `NOT_READY` or failed states.
- **Detail Page Link:** Added `Link` from `react-router` around the `companyCode` in each table row to navigate to the corresponding detail page (`/tenants/:companyCode`).
- **Polling Removed:** Removed automatic polling logic. Data refresh now relies on manual refresh or invalidation after mutations.

### 3. Tenant Detail Page (`applications/master-frontend/src/pages/TenantDetailPage.tsx`)

- **New Page Creation:** Created a dedicated page (`/tenants/:companyCode`) to view detailed information about a single tenant.
- **Data Fetching:** Uses `useQuery` to fetch detailed health data from `GET /api/health/tenant/:companyCode`.
- **UI Components:**
  - Displays overall tenant status (`READY`, `NOT_READY`, `STOPPED`).
  - Shows detailed status for Namespace, PostgreSQL, Backend API, and User Frontend using Cards.
  - Includes pod readiness counts (`readyPods`/`totalPods`).
  - Displays Kubernetes error information (`kubernetesError`, `errorInfo`) within scrollable sections (`max-h`, `overflow-y-auto`) if present, preventing UI overflow.
- **Navigation & Refresh:** Includes "뒤로가기" (Go Back) and "새로고침" (Refresh) buttons.
- **Action Buttons:**
  - Added "생성 (Deploy)", "복원 (Start)", "중단 (Stop)", "삭제 (Delete)" buttons.
  - Implemented corresponding `useMutation` hooks calling the backend APIs (`/deploy`, `/start`, `/stop`, `/`).
  - Refined button disabling logic based on the detailed health status and mutation pending states:
    - "복원 (Start)" is enabled only when the status is `STOPPED`.
    - "생성 (Deploy)" is enabled for `NOT_READY` or failed states.
    - "중단 (Stop)" is enabled only for the `READY` state.
    - "삭제 (Delete)" is generally enabled unless another action is pending.

## Next Steps / Considerations

- Implement the "새 테넌트 생성" (Create New Tenant) page and functionality.
- Add more robust user feedback (e.g., using toasts instead of alerts).
- Refactor shared API call functions (deploy, start, stop, delete) into a dedicated module to avoid duplication between list and detail pages.
- Resolve potential module resolution errors for `react-router` and `@/components/*` based on the specific project setup (ensure dependencies are installed and paths are correct).
- Ensure proper routing setup in `App.tsx` or the main router file for the detail page (`/tenants/:companyCode`).
