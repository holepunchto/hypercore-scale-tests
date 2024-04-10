FROM node:20-slim

RUN apt update && apt install curl -y

RUN useradd --create-home runner
USER runner

COPY package.json /home/runner/package.json
COPY package-lock.json /runner/bot/package-lock.json
COPY node_modules /home/runner/node_modules
COPY lib /home/runner/lib
COPY run.js /home/runner/

ENV HYPERCORE_SCALE_METRICS_PORT=8080
ENV HYPERCORE_SCALE_METRICS_HOST=0.0.0.0
ENV HYPERCORE_SCALE_STORAGE_PATH=/home/runner/corestore

RUN mkdir $HYPERCORE_SCALE_STORAGE_PATH # Ensures correct permissions if corestore mounted as volume

HEALTHCHECK --retries=1 --timeout=5s CMD curl --fail http://127.0.0.1:${HYPERCORE_SCALE_METRICS_PORT}/health

WORKDIR /home/runner/
ENTRYPOINT ["node", "/home/runner/run.js"]
