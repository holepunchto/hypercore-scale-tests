const promClient = require('prom-client')
const fastify = require('fastify')
const pino = require('pino')
const Runner = require('./lib/experiment-runner')
const goodbye = require('graceful-goodbye')
const Hyperbee = require('hyperbee')
const Corestore = require('corestore')

const { WriteTest, ReadTest } = require('./lib/experiments')

const EXPERIMENTS = [
  {
    experimentClass: WriteTest,
    params: {
      nrBlocks: 100000,
      blockByteSize: 1000
    },
    name: 'write_100k_blocks',
    description: 'write 100K hypercore blocks to disk'
  }, {
    experimentClass: ReadTest,
    params: {
      nrBlocks: 100000,
      blockByteSize: 1000
    },
    name: 'read_100K_blocks',
    description: 'read 100K hypercore blocks from disk'
  }
]

function loadConfig () {
  return {
    metricsPort: process.env.HYPERCORE_SCALE_METRICS_PORT || 0,
    metricsHost: process.env.HYPERCORE_SCALE_METRICS_HOST || '127.0.0.1',
    testInterval: process.env.HYPERCORE_SCALE_TEST_INTERVAL_MS || 1000 * 60, // * 60
    storage: process.env.HYPERCORE_SCALE_STORAGE || 'hypercore-scale-tests-corestore'
  }
}

async function main () {
  const config = loadConfig()
  const logger = pino()
  const store = new Corestore(config.storage)
  const resBee = new Hyperbee(
    store.get({ name: 'res-bee' }),
    {
      keyEncoding: 'utf-8',
      valueEncoding: 'json'
    }
  )

  const runner = new Runner(
    EXPERIMENTS,
    resBee,
    logger,
    { testInterval: config.testInterval }
  )

  const server = setupMonitoringServer(runner)
  goodbye(async () => {
    logger.info('Closing runner')
    if (runner.opening) await runner.close()

    logger.info('Closing server')
    await server.close()
    logger.info('Exiting')
  })

  server.listen({ host: config.metricsHost, port: config.metricsPort })

  await runner.ready()
  logger.info('Fully setup')
}

function setupMonitoringServer (runner) {
  // promClient.registerDefaultMetrics()

  setupMetrics(runner.resBee, runner.experiments)

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

function setupMetrics (bee, experimentNames) {
  const metrics = []
  for (const { name, description } of experimentNames) {
    const runtimeMetric = new promClient.Gauge({
      name: `${name}_runtime_ms`, // DEVNOTE: assumes runtime is always reported in ms
      help: `ms taken to ${description}`,
      collect: async function () {
        const res = await bee.get(name)
        this.set(res?.value.runTimeMs || -1)
      }
    })
    metrics.push(runtimeMetric)
  }

  return metrics
}

main()
