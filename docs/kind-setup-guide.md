# Kind를 이용한 로컬 Kubernetes 클러스터 설정 가이드

## Kind란?

Kind(Kubernetes in Docker)는 Docker 컨테이너를 노드로 사용하여 로컬 환경에서 Kubernetes 클러스터를 실행할 수 있게 해주는 도구입니다.

## 사전 요구사항

1. Docker Desktop 설치 및 실행

   - macOS의 경우: `brew install --cask docker`
   - Docker Desktop이 실행 중이어야 함

2. Kind 설치

   ```bash
   brew install kind
   ```

3. kubectl 설치
   ```bash
   brew install kubectl
   ```

## 현재 프로젝트의 Kind 설정

현재 프로젝트에서는 다음과 같은 Kind 설정을 사용합니다 (`kind-config.yaml`):

```yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: deployment-strategy
nodes:
  - role: control-plane
    extraPortMappings:
      - containerPort: 80
        hostPort: 80
        protocol: TCP
      - containerPort: 443
        hostPort: 443
        protocol: TCP
  - role: worker
  - role: worker
  - role: worker
```

### 설정 설명

1. **클러스터 구성**

   - 클러스터 이름: `deployment-strategy`
   - 1개의 컨트롤 플레인 노드
   - 3개의 워커 노드

2. **포트 매핑**
   - HTTP(80) 및 HTTPS(443) 포트를 호스트 시스템과 매핑
   - 웹 애플리케이션 접근을 위한 설정

## 클러스터 생성 및 관리

1. 클러스터 생성

   ```bash
   kind create cluster --config kind-config.yaml
   ```

2. 클러스터 상태 확인

   ```bash
   kind get clusters
   kubectl cluster-info
   kubectl get nodes
   ```

3. 클러스터 삭제
   ```bash
   kind delete cluster --name deployment-strategy
   ```

## 주의사항 및 모범 사례

1. **리소스 관리**

   - Docker Desktop의 리소스 할당 확인
   - 4개 노드 구성을 위해 충분한 메모리 필요 (최소 8GB 권장)

2. **네트워크 설정**

   - 80, 443 포트가 사용 가능한지 확인
   - 다른 프로세스와의 포트 충돌 주의

3. **고가용성**
   - 3개의 워커 노드로 워크로드 분산 가능
   - 노드 장애 시 자동 복구 테스트 가능

## 문제 해결

1. 포트 충돌 발생 시

   - `lsof -i :80` 또는 `lsof -i :443`으로 포트 사용 확인
   - 필요시 다른 포트로 매핑 변경

2. 클러스터 생성 실패 시

   - Docker Desktop 실행 상태 확인
   - 시스템 리소스 사용량 확인
   - Kind 및 Docker 로그 확인

3. 노드 상태 이상 시
   - `kubectl describe node [노드이름]`으로 상태 확인
   - `docker ps`로 컨테이너 상태 확인

# Kubernetes GUI 도구 설정 가이드

## OpenLens 설정

### 1. 설치

```bash
brew install --cask openlens
```

### 2. 초기 설정

1. OpenLens 실행
2. 좌측 하단 + 버튼 클릭
3. kubeconfig 파일 선택 (기본 위치: ~/.kube/config)
4. 클러스터 연결 확인

### 3. 주요 기능

- 왼쪽 사이드바: 전체 리소스 목록
- 중앙 패널: 선택된 리소스 상세 정보
- 하단 패널: 로그 및 터미널
- 상단 툴바: 네임스페이스 선택 및 필터

## K9s 설정

### 1. 설치

```bash
brew install k9s
```

### 2. 사용법

- 실행: 터미널에서 `k9s` 입력
- 종료: `:quit` 또는 `Ctrl+C`

### 3. 주요 단축키

- `:pod`: 파드 목록 보기
- `:dp`: 디플로이먼트 목록
- `:svc`: 서비스 목록
- `?`: 도움말
- `/`: 검색
- `d`: 리소스 삭제
- `l`: 로그 보기

### 4. 설정 커스터마이징

K9s 설정 파일 위치: `~/.k9s/config.yml`
