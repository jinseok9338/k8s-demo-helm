# Helm 차트 학습 가이드

이 문서는 로컬에서 개발 중인 Helm 차트(`backend-api`, `user-frontend`)와 외부 Helm 차트(예: Bitnami PostgreSQL)를 이해하고 학습하는 방법을 안내합니다.

## 1. 로컬 커스텀 차트 학습 (`helm/backend-api`, `helm/user-frontend`)

로컬에 소스 코드가 있는 차트를 학습하는 단계입니다.

### 1.1 Chart.yaml

- **역할:** 차트의 이름, 버전, 설명 등 기본적인 메타데이터를 정의합니다.
- **확인 사항:** 차트의 기본 정보, API 버전 (`apiVersion`: v2 권장), 의존성(dependencies) 여부.

### 1.2 values.yaml

- **역할:** 차트의 기본 설정값들을 정의하는 **가장 중요한 파일**입니다. 배포 시 커스터마이징할 수 있는 변수들을 모아놓은 곳입니다.
- **확인 사항:**
  - 어떤 값들이 정의되어 있는가? (이미지 정보, 레플리카 수, 서비스 포트, DB 연결 정보, 리소스 제한 등)
  - 각 값의 기본 설정은 무엇인가?
  - 주석을 통해 각 값의 의미와 용도를 파악합니다.
- **핵심:** 이 파일을 통해 사용자는 차트의 동작 방식을 쉽게 변경할 수 있으며, `helm install/upgrade --set key=value` 명령으로 이 값들을 런타임에 덮어쓸 수 있습니다.

### 1.3 templates/ 디렉토리

- **역할:** 쿠버네티스 매니페스트 파일들의 템플릿이 위치합니다. Helm은 이 템플릿들과 `values.yaml` 값을 조합하여 최종 매니페스트를 생성합니다.

#### Go 템플릿 문법

- **값 참조:**

  - `{{ .Release.Name }}`: Helm 릴리스 이름
  - `{{ .Release.Namespace }}`: 배포될 네임스페이스
  - `{{ .Chart.Name }}`: `Chart.yaml`에 정의된 차트 이름
  - `{{ .Chart.AppVersion }}`: 애플리케이션 버전
  - `{{ .Values.some.value }}`: `values.yaml`의 값 참조

- **함수 및 액션:**

  - `{{ include "mychart.labels" . }}`: `_helpers.tpl`에 정의된 템플릿 조각 포함
  - `{{ quote .Values.someString }}`: 문자열 값에 따옴표 추가
  - `{{ nindent 4 .Values.multiline }}`: 여러 줄 문자열의 들여쓰기 조정
  - `{{ default .Values.optionalValue "defaultValue" }}`: 기본값 설정

- **제어 구조:**
  - `{{ if .Values.enabled }} ... {{ end }}`: 조건부 렌더링
  - `{{ range .Values.items }} ... {{ end }}`: 리스트/맵 순회

#### templates/\_helpers.tpl

- **역할:** 여러 템플릿에서 공통적으로 사용될 템플릿 조각을 정의
- **용도:** 레이블 생성 규칙, fullname 생성 규칙 등 코드 재사용

#### 주요 템플릿 파일 분석

- `deployment.yaml`: Pod를 관리하는 Deployment 리소스 정의 (이미지, 포트, 환경 변수, 리소스 제한 등 포함)
- `service.yaml`: Pod에 접근할 수 있는 Service 리소스 정의
- `ingressroute.yaml`: Traefik 사용 시 외부 트래픽 라우팅 규칙 정의 (PathPrefix, Middleware 등)
- `job-migration.yaml`: DB 마이그레이션을 위한 Job 정의, `helm.sh/hook` 어노테이션 사용
- `configmap-migrations.yaml`: 마이그레이션 SQL 파일을 포함하는 ConfigMap 생성, `.Files.Glob` 사용
- `serviceaccount.yaml`: 필요 시 ServiceAccount 정의

### 1.4 .helmignore

- **역할:** Helm 패키징 시 제외할 파일이나 디렉토리를 지정

## 2. 외부 차트 학습 (예: Bitnami PostgreSQL)

### 2.1 values.yaml 탐색

- **핵심:** Bitnami 차트는 매우 상세하고 유연한 `values.yaml`을 제공함
- **확인 방법:**
  - Artifact Hub: [https://artifacthub.io/](https://artifacthub.io/) 에서 `bitnami/postgresql` 검색 후 Default Values 확인
  - Helm 명령어:
    ```bash
    helm repo add bitnami https://charts.bitnami.com/bitnami
    helm repo update
    helm show values bitnami/postgresql > postgresql-values.yaml
    # 또는
    helm pull bitnami/postgresql --untar
    ```
- **주요 설정값 예시:**
  - `image.registry`, `image.repository`, `image.tag`
  - `architecture`: standalone vs replication
  - `auth.database`, `auth.username`, `auth.password`, `auth.postgresPassword`, `auth.existingSecret`
  - `primary.persistence.*`: PV/PVC 사용 설정
  - `primary.resources`, `readReplicas.*`, `networkPolicy.enabled`, `service.*`, `metrics.enabled`

### 2.2 README 문서 확인

- Artifact Hub 또는 GitHub 저장소에서 확인 가능
- `values.yaml`의 각 파라미터 설명, 예시, 일반적인 구성 패턴 포함

### 2.3 템플릿 구조 이해 (심화)

- `helm pull --untar`로 로컬에 다운로드 후 `templates/` 디렉토리 분석 가능
- StatefulSet, ConfigMap, Secret 등 다양한 리소스 정의 포함
- 처음엔 `values.yaml` 설정에 집중, 궁금할 때 템플릿 구조 살펴보기

## 3. 학습 팁

- **helm template 사용:**
  ```bash
  helm template my-release ./path/to/chart --namespace my-ns
  helm template my-release ./path/to/chart --namespace my-ns --set image.tag=latest > rendered.yaml
  ```
- **공식 문서 참고:**
  - [Helm Docs](https://helm.sh/docs/)
  - 템플릿 문법, 내장 객체, 함수 목록 등 확인 가능
