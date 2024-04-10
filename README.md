# Hypercore Scale Tests

Scaling tests which are simple enough to run in a single process.

This module currently combines 2 services:
- An experiment runner (`./lib/experiment-runner.js`) to continuously run a list of experiments and store the results in a hyperbee
- A prometheus metrics exporter (`./lib/metrics.js`) which exposes a `/metrics` endpoint with the runtime of the latest run of each experiment

If many experiments are added (more than can be run by a single process), it might make sense to deploy these 2 services separately and to set up replication on the hyperbee. That way, a metrics exporter can report metrics from several experiment runners.

## Install + Run

For quick tests:

`npm i && node run.js | pino-pretty`

This module is easiest to deploy as a docker image.

There are two release streams:
- The default one tagged as `latest`, built when a new release of this package is made
- A nightly build tagged `build-with-latest-deps`, containing the latest dependencies of all packages, within the specified major versions

The nightly built is triggered with a schedule in `./.github/workflows/ci.yml`.

The intended way of deploying this is with a cron script which updates to the latest nightly build every day:

```
sudo docker pull ghcr.io/holepunchto/hypercore-scale-tests:build-with-latest-deps
sudo docker stop hypercore-scale-tests
sudo docker rm hypercore-scale-tests
sudo docker run -d -p 127.0.0.1:52416:8080 \
  --env HYPERCORE_SCALE_TEST_INTERVAL_MS=300000 \
  --env HYPERCORE_SCALE_EXPERIMENTS_FILE_LOC=/home/runner/config/config.json \
  --name hypercore-scale-tests \
  --mount type=volume,source=hypercore-scale-tests-volume,destination=/home/runner/corestore \
  --mount type=bind,source=/etc/hypercore-scale-experiments,destination=/home/runner/config,readonly \
  --restart=on-failure \
  --memory=1024M \
  ghcr.io/holepunchto/hypercore-scale-tests:build-with-latest-deps
```

Note: an action which redeploys when it detects an update to `ghcr.io/holepunchto/hypercore-scale-tests:build-with-latest-deps` would also work. If that is possible, it would arguably be cleaner.

To scrape the metrics, point a prometheus instance to the exposed port.

## Config

ENV vars can be used to change the basic parameters (see `run.js`).

The experiments to run must be defined in a separate config file. By default this is `config.json`

See [example-config.json](example-config.json) for its structure.

## Adding New Experiment Types

Inherit from the `Experiment` class, then implement the `_runExperiment` method, and optionally the `_setup` and `_teardown` methods.

Add the experiment to the config in `./run.js`

The runtime of the experiment is the runtime of the `_runExperiment` method, so `_setup` time is not taken into account.

Experiments should be cancelable at all times: the experiment runner closes an experiment when it takes too long, or when it's shutting down. Each experiment is responsible for being nice, so `if (this.closing) return` statements should be added after async calls (also in the `_setup` and `_teardown` steps).
