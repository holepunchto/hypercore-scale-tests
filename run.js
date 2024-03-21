const promClient = require('prom-client')
const fastify = require('fastify')
const pino = require('pino')
const Runner = require('./lib/experiment-runner')
const goodbye = require('graceful-goodbye')

function loadConfig () {
  return {
    metricsPort: process.env.HYPERCORE_SCALE_METRICS_PORT || 0,
    metricsHost: process.env.HYPERCORE_SCALE_METRICS_HOST || '127.0.0.1',
    testInterval: process.env.HYPERCORE_SCALE_TEST_INTERVAL_MS || 1000 * 60 * 60
  }
}

async function main () {
  const config = loadConfig()
  const logger = pino()

  const runner = new Runner(config.testInterval, logger)
  const server = setupMonitoringServer(runner)
  goodbye(async () => {
    logger.info('Closing runner')
    if (runner.opening) await runner.close()

    logger.info('Closing server')
    await server.close()
    logger.info('Exiting')
  })

  await server.listen({ host: config.metricsHost, port: config.metricsPort })

  await runner.ready()
  logger.info('Fully setup')
}

function setupMonitoringServer (runner) {
  // promClient.registerDefaultMetrics()

  // TODO: labels for params
  setupMetrics(runner)

  const server = fastify({ logger: runner.logger })
  server.get('/metrics', { logLevel: 'warn' }, async function (req, reply) {
    const metrics = await promClient.register.metrics()
    reply.send(metrics)
  })

  server.get('/health', { logLevel: 'warn' }, async function (req, reply) {
    reply.send('healthy\n')
  })

  return server
}

function setupMetrics (runner) {
  const metric = new promClient.Gauge({
    name: 'hypercore_experiment_write_ms',
    help: `ms to write ${runner.params.blockByteSize} blocks of ${runner.params.blockByteSize} bytes`,
    collect: function () {
      let res = -1
      if (runner.lastRunTime != null) res = runner.lastRunTime
      this.set(res)
    }
  })

  return metric
}

main()
