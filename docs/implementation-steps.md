# 멀티 테넌트 E-commerce 플랫폼 구현 단계

## 1. 데이터베이스 설정 (PostgreSQL)

### Docker를 사용한 PostgreSQL 설정

```bash
# PostgreSQL 컨테이너 실행
docker run -d \
  --name private-sales-db \
  -e POSTGRES_USER=privatesales \
  -e POSTGRES_PASSWORD=privatesales \
  -e POSTGRES_DB=privatesales \
  -p 5432:5432 \
  postgres:latest

# 컨테이너 상태 확인
docker ps -a | grep private-sales-db
```

### 데이터베이스 접속 테스트

```bash
# psql을 사용한 접속 테스트
docker exec -it private-sales-db psql -U privatesales -d privatesales
```

### 주의사항

- 개발 환경 전용 설정입니다. 프로덕션 환경에서는 보안을 강화해야 합니다.
- 데이터 영속성이 필요한 경우 볼륨 마운트를 고려하세요.

## 2. Admin Backend 설정

### 프로젝트 초기화

```bash
# 프로젝트 디렉토리 생성
mkdir -p applications/admin-backend
cd applications/admin-backend

# 패키지 설치
pnpm install
```

### 주요 의존성

- Hono.js: 빠르고 가벼운 웹 프레임워크
- @kubernetes/client-node: Kubernetes API 클라이언트
- pg: PostgreSQL 클라이언트
- dotenv: 환경 변수 관리

### 개발 서버 실행

```bash
pnpm dev
```

### 빌드 및 실행

```bash
pnpm build
pnpm start
```
