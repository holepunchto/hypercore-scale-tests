const promClient = require('prom-client')
const fastify = require('fastify')

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
      name: `hypercore_scale_${name}_runtime_ms`, // DEVNOTE: assumes runtime is always reported in ms
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

module.exports = setupMonitoringServer
