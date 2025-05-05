# Day 4: Troubleshooting and Tenant Deployment Success

## 주요 목표

- Master Frontend/Backend의 Kind 클러스터 배포 안정화
- Ingress 라우팅 및 DB 연결 문제 해결
- Tenant 배포 프로세스 디버깅 및 성공
- Master 애플리케이션 수동 배포 스크립트 작성

## 진행 내용

1.  **Ingress 라우팅 문제 해결:**

    - `master-frontend` Ingress에서 `/api` 경로 요청이 `master-backend`로 전달되지 않는 문제 발생.
    - 원인: Ingress 규칙에서 `master-backend` 서비스 포트를 `number: 80`으로 잘못 지정 (실제는 `name: http` -> `3001`). 또한, 백엔드 서비스 이름이 Helm 템플릿 오류로 `master-backend-release-master-backend`로 잘못 렌더링됨.
    - 해결: `helm/master-frontend/templates/ingress.yaml` 및 `values.yaml` 수정하여 올바른 포트 이름(`http`)과 서비스 이름(`master-backend-release`) 사용하도록 수정. `helm upgrade` 적용. Traefik 파드 재시작 후 정상 작동 확인.

2.  **DB 연결 문제 해결 (Master Backend 500 Error):**

    - `/api/tenants` 요청 시 500 에러 발생 (`getaddrinfo ENOTFOUND your-managed-db-host`).
    - 원인: `master-backend`가 사용하는 `DATABASE_URL` Secret 값이 `helm/master-backend/values.yaml`의 `secret.databaseUrl`이 아닌 `config.database.url`에 의해 설정되고 있었고, 이 값이 플레이스홀더로 남아있었음.
    - 해결: `helm/master-backend/templates/secret.yaml`이 `config.database.url`을 참조함을 확인. `helm/master-backend/values.yaml`의 `config.database.url` 값을 Kind 클러스터에서 로컬 Docker DB에 접근하기 위한 `postgresql://postgres:masterdb@host.docker.internal:5432/postgres`로 수정. 불필요한 `secret` 섹션 제거. `helm upgrade` 및 파드 재시작 후 정상 작동 확인.

3.  **Tenant 배포 문제 해결 (`cha-tenant`):**

    - **Helm Repo 오류:** PostgreSQL 배포 시 `Error: repo bitnami not found` 발생.
      - 해결: `master-backend` Dockerfile에 `helm repo add bitnami ...` 명령어 추가. 이미지 재빌드 및 푸시 (`v0.1.3`), Helm 릴리스 업그레이드.
    - **RBAC 권한 오류 (PDB, ServiceAccount):** PostgreSQL 배포 시 `poddisruptionbudgets ... is forbidden` 및 `serviceaccounts ... is forbidden` 오류 발생.
      - 해결: `helm/master-backend/templates/rbac.yaml`의 `ClusterRole`에 `policy/poddisruptionbudgets` 및 `""/serviceaccounts` 리소스에 대한 권한 추가. Helm 릴리스 업그레이드.
    - **Git Scheme 오류:** Backend API 배포 시 `Error: scheme "git+https" not supported` 발생.
      - 해결: `master-backend` 코드(`deployTenantInBackground`) 수정. Helm 명령어 실행 전에 `git clone` 및 `git sparse-checkout`을 사용하여 Git 리포지토리에서 차트를 컨테이너 내 임시 로컬 경로(`/tmp/tenant-charts/...`)로 다운로드하고, 이 로컬 경로를 Helm 명령어에 사용하도록 변경. `git` 명령어를 위해 `master-backend` Dockerfile 런타임 스테이지에 `git` 패키지 추가. 이미지 재빌드 및 푸시 (`v0.1.5` -> `v0.1.6`).
    - **Git Path 오류:** Backend API 배포 시 `Error: path "/tmp/tenant-charts/CHA/helm/backend-api" not found` 발생.
      - 해결: `deployTenantInBackground` 함수의 `git clone/sparse-checkout` 로직을 개선하여 표준 출력/오류 로깅 강화, exit code 확인, `cwd` 옵션 명시 등 안정성 확보. 이미지 재빌드 및 푸시 (`v0.1.7`). Helm 릴리스 업그레이드.

4.  **Tenant 배포 성공:** 위 오류들을 모두 해결한 후 `cha-tenant` 배포가 최종적으로 성공함 (PostgreSQL -> Backend API -> User Frontend 순서).

5.  **수동 배포 스크립트 작성:**
    - `master-backend`와 `master-frontend`를 쉽게 배포/업그레이드하기 위해 `scripts/deploy-master-backend.sh` 및 `scripts/deploy-master-frontend.sh` 스크립트 생성 (`helm upgrade --install ... --wait`).
    - 스크립트에 실행 권한 부여.

## 최종 상태

- Kind 클러스터 (`multi-tenant-dev`)에 `master-backend` (v0.1.7) 및 `master-frontend` (v0.1.1) 배포 완료.
- `master-frontend`는 Ingress를 통해 `master.localhost` (Traefik 포트포워딩 필요 시 `:8080`)로 접근 가능하며, `/api` 경로는 `master-backend`로 라우팅됨.
- `master-backend`는 로컬 Docker PostgreSQL (`host.docker.internal`)에 정상적으로 연결됨.
- `master-backend` API를 통해 Tenant (`cha-tenant`) 배포가 성공적으로 수행됨 (필요한 Helm 차트는 Git에서 동적으로 클론).
- `master-backend` 및 `master-frontend`는 `scripts/` 폴더의 쉘 스크립트를 통해 수동으로 배포/업그레이드 가능.

## 다음 단계

- 현재까지의 구성을 바탕으로 Google Kubernetes Engine (GKE) 환경에 배포 준비. (`DeployToGKE.md` 업데이트)
