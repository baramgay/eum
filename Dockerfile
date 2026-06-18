# EUM 플랫폼 Next.js 프로덕션 이미지
FROM node:20-alpine

WORKDIR /app

# 네이티브 의존성 빌드 호환성
RUN apk add --no-cache libc6-compat

# 의존성 설치 (devDependencies 포함 — next build 필요)
COPY package.json package-lock.json ./
RUN npm ci

# 소스 복사 및 빌드
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "run", "start"]
