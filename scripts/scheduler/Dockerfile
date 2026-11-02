# The scheduler: publishes one schedule trigger and exits, for Kubernetes CronJobs. Build it
# from this folder:
#   docker build -t fitness-scheduler scripts/scheduler
FROM node:24.22.2-alpine AS dependencies
WORKDIR /scheduler
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM node:24.22.2-alpine
WORKDIR /scheduler
COPY --from=dependencies /scheduler/node_modules ./node_modules
COPY publish-schedule-trigger.mjs ./
USER node
ENTRYPOINT ["node", "publish-schedule-trigger.mjs"]
