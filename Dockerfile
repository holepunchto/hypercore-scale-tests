FROM node:20-slim

# TODO: consider a node script instead of curl
RUN apt update && apt install curl -y

RUN useradd --create-home -u 8192 hypercore-scale-tests
USER hypercore-scale-tests

COPY package.json /home/hypercore-scale-tests/package.json
COPY package-lock.json /hypercore-scale-tests/bot/package-lock.json
COPY node_modules /home/hypercore-scale-tests/node_modules
COPY lib /home/hypercore-scale-tests/lib
COPY run.js /home/hypercore-scale-tests/
COPY LICENSE /home/hypercore-scale-tests
COPY NOTICE /home/hypercore-scale-tests

ENV HYPERCORE_SCALE_METRICS_PORT=8080
ENV HYPERCORE_SCALE_METRICS_HOST=0.0.0.0
ENV HYPERCORE_SCALE_STORAGE_PATH=/home/hypercore-scale-tests/corestore

RUN mkdir $HYPERCORE_SCALE_STORAGE_PATH # Ensures correct permissions if corestore mounted as volume

HEALTHCHECK --retries=1 --timeout=5s CMD curl --fail http://127.0.0.1:${HYPERCORE_SCALE_METRICS_PORT}/health

WORKDIR /home/hypercore-scale-tests/
ENTRYPOINT ["node", "/home/hypercore-scale-tests/run.js"]
