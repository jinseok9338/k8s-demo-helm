# Helm을 사용한 애플리케이션 배포 가이드

## 1. Helm 소개

Helm은 Kubernetes 패키지 매니저로, 복잡한 애플리케이션 배포를 단순화하고 재사용 가능한 패키지(차트)로 관리할 수 있게 해줍니다.

## 2. 사전 준비사항

### 2.1 필수 도구 설치

```bash
# Helm 설치
brew install helm

# Helm 버전 확인
helm version
```

### 2.2 Helm 레포지토리 설정

```bash
# Helm 레포지토리 업데이트
helm repo update
```

## 3. 2048 게임 배포하기

### 3.1 프로젝트 구조

```
deployment/deploy-using-helm/2048/
├── Chart.yaml          # 차트 메타데이터
├── values.yaml         # 기본 설정값
├── templates/          # Kubernetes 매니페스트 템플릿
│   ├── deployment.yaml # 배포 설정
│   ├── service.yaml    # 서비스 설정
│   └── ingress.yaml   # 인그레스 설정
└── .helmignore        # Helm 무시 파일
```

### 3.2 배포 방법

1. **차트 설치**

```bash
# 프로젝트 디렉토리로 이동
cd deployment/deploy-using-helm

# Helm 차트 설치
helm install game-2048 ./2048
```

2. **배포 상태 확인**

```bash
# Helm 릴리스 상태 확인
helm list

# Kubernetes 리소스 확인
kubectl get all -l "app.kubernetes.io/name=game-2048"
```

3. **애플리케이션 접근**

```bash
# 포트 포워딩 설정
kubectl port-forward svc/game-2048 8080:80

# 브라우저에서 접속
# http://localhost:8080
```

### 3.3 배포 관리

1. **설정 업데이트**

```bash
# values.yaml 수정 후 업그레이드
helm upgrade game-2048 ./2048
```

2. **배포 롤백**

```bash
# 이전 버전으로 롤백
helm rollback game-2048 1
```

3. **배포 삭제**

```bash
# 릴리스 삭제
helm uninstall game-2048
```

## 4. 문제 해결

### 4.1 일반적인 문제

1. **이미지 풀 에러**

   - 이미지 이름과 태그 확인
   - 레지스트리 접근 권한 확인

2. **포드 시작 실패**

   - 리소스 제한 확인
   - 로그 확인
   - 이벤트 확인

3. **서비스 접근 불가**
   - 서비스 타입 확인
   - 포트 설정 확인
   - 엔드포인트 확인

### 4.2 디버깅 명령어

```bash
# 파드 상세 정보 확인
kubectl describe pod [pod-name]

# 서비스 상세 정보 확인
kubectl describe service game-2048

# 인그레스 상세 정보 확인
kubectl describe ingress game-2048
```

## 5. 모범 사례

1. **리소스 관리**

   - 적절한 리소스 제한 설정
   - HPA 구성 고려
   - 노드 선택기 활용

2. **보안**

   - RBAC 설정
   - 네트워크 정책 구성
   - 보안 컨텍스트 설정

3. **모니터링**
   - 메트릭 수집 설정
   - 로그 수집 구성
   - 알림 설정
