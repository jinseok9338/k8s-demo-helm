# Day 1: 클러스터 설정 및 기본 애플리케이션 배포

이 문서는 Kind 클러스터를 설정하고 PostgreSQL 데이터베이스, Backend API, User Frontend를 Helm을 사용하여 배포하는 과정을 기록합니다.

## 1. Kind 클러스터 생성 및 확인

- Kind 클러스터 설정 파일 (`kind-config.yaml`)을 사용하여 클러스터를 생성합니다.
  ```bash
  ./scripts/create-kind-cluster.sh
  ```
- 클러스터 상태를 확인합니다.
  ```bash
  ./scripts/check-cluster-status.sh
  ```

## 2. 네임스페이스 준비

- 모든 애플리케이션 구성요소를 배포할 `base-app` 네임스페이스를 생성합니다. (추후 테넌트별 네임스페이스 분리 예정)
  ```bash
  kubectl create ns base-app
  ```

## 3. Helm 리포지토리 설정

- PostgreSQL 배포를 위해 Bitnami Helm 리포지토리를 추가하고 업데이트합니다.
  ```bash
  helm repo add bitnami https://charts.bitnami.com/bitnami
  helm repo update
  ```

## 4. PostgreSQL 배포 (Bitnami Chart 사용)

- Bitnami PostgreSQL 차트를 사용하여 `base-app` 네임스페이스에 `be-db` 릴리스 이름으로 배포하고 `backend_db` 데이터베이스를 생성합니다.
  ```bash
  helm upgrade --install be-db bitnami/postgresql --namespace base-app --set auth.database=backend_db
  ```
- 배포 확인:
  ```bash
  kubectl get pods -n base-app -l app.kubernetes.io/name=postgresql,app.kubernetes.io/instance=be-db
  ```

## 5. Backend API 배포

- `helm/backend-api` 차트의 `values.yaml`에서 데이터베이스 호스트(`database.host`)를 `be-db-postgresql.base-app.svc.cluster.local`로 설정합니다.
- Secret 키 참조 오류 해결 (`job-migration.yaml`, `deployment.yaml` 수정: `PGUSER`는 'postgres' 직접 사용, `PGPASSWORD` 키는 'postgres-password' 사용, `DATABASE_URL` 재구성).
- 마이그레이션 ConfigMap에 hook 어노테이션 추가 (`configmap-migrations.yaml` 수정).
- `--wait` 플래그 없이 Helm 차트를 배포합니다 (Helm hook 및 리소스 생성 문제 해결).
  ```bash
  helm upgrade --install backend-api helm/backend-api --namespace base-app
  ```
- 배포 확인 (마이그레이션 Job 완료 후):
  ```bash
  kubectl get deployment backend-api -n base-app
  kubectl get pods -n base-app -l app.kubernetes.io/instance=backend-api,app.kubernetes.io/name=backend-api
  ```

## 6. User Frontend 배포

- `helm/user-frontend` 차트의 `values.yaml`에서 이미지 태그(`image.tag`)를 `v0.1.2`로 업데이트합니다.
- Helm 차트를 배포합니다.
  ```bash
  helm upgrade --install user-frontend helm/user-frontend --namespace base-app
  ```
- 배포 확인:
  ```bash
  kubectl get deployment user-frontend -n base-app
  kubectl get pods -n base-app -l app.kubernetes.io/instance=user-frontend,app.kubernetes.io/name=user-frontend
  ```

## 7. (선택) 초기 데이터 시딩 (테스트용)

- User Frontend에서 'MAR' 회사 코드 테스트를 위해 DB에 직접 샘플 데이터를 삽입합니다.

  ```bash
  # 1. 비밀번호 환경 변수 설정
  export POSTGRES_PASSWORD=$(kubectl get secret --namespace base-app be-db-postgresql -o jsonpath="{.data.postgres-password}" | base64 -d)

  # 2. 데이터 삽입 (ON CONFLICT 구문 포함)
  kubectl exec -n base-app be-db-postgresql-0 -- env PGPASSWORD="$POSTGRES_PASSWORD" psql -U postgres -d backend_db -c "INSERT INTO company_config (company_code, logo_url, created_at, updated_at) VALUES ('MAR', 'https://via.placeholder.com/150/0000FF/808080?text=MAR+Logo', NOW(), NOW()) ON CONFLICT (company_code) DO UPDATE SET logo_url = EXCLUDED.logo_url, updated_at = NOW();"
  ```
