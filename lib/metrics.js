const promClient = require('prom-client')
const fastify = require('fastify')
const SubEncoder = require('sub-encoder')

const DESCRIPTIONS = new Map()
DESCRIPTIONS.set('read', 'Read hypercore blocks from hard disk')
DESCRIPTIONS.set('write', 'Write hypercore blocks to hard disk')
DESCRIPTIONS.set('download_read_stream', 'Download hypercore blocks using a readStream')
DESCRIPTIONS.set('download', 'Download hypercore blocks using a download range')
DESCRIPTIONS.set('drive_get', 'Get files from a Hyperdrive')
DESCRIPTIONS.set('drive_write', 'Write files to a Hyperdrive')
DESCRIPTIONS.set('bee_write', 'Write key-value pairs to a Hyperbee')

function setupMonitoringServer (bee, experimentConfig, logger) {
  // promClient.registerDefaultMetrics()

  setupMetrics(bee, experimentConfig, logger)

  const server = fastify({ logger })
  server.get('/metrics', { logLevel: 'warn' }, async function (req, reply) {
    const metrics = await promClient.register.metrics()
    reply.send(metrics)
  })

  server.get('/health', { logLevel: 'warn' }, async function (req, reply) {
    reply.send('healthy\n')
  })

  return server
}

function setupMetrics (bee, experimentInfo, logger) {
  const metrics = []

  const subEncoder = new SubEncoder()

  for (const [expType, parametrisations] of Object.entries(experimentInfo)) {
    if (parametrisations.length === 0) continue

    const name = toSnakeCase(expType)
    const help = DESCRIPTIONS.get(name)
    if (!help) throw new Error(`Missing description for metric ${name}`)

    const labelNamesMap = createLabelNamesMap(parametrisations)
    const labelNames = [...labelNamesMap.keys()]

    const keyEncoding = subEncoder.sub(name)
    const collect = getCollectFunction(
      bee, keyEncoding, labelNamesMap, logger
    )

    logger.info(`adding metric ${name} with labels ${labelNames}`)

    const metric = new promClient.Gauge({
      name: `hypercorescale_${name}`,
      help,
      labelNames,
      collect
    })

    metrics.push(metric)
  }

  return metrics
}

function getCollectFunction (bee, keyEncoding, labelNamesMap, logger) {
  return async function () {
    try {
      const stream = bee.createReadStream({ keyEncoding })

      for await (const entry of stream) {
        // TODO: consider adding a check on the timestamp
        // to avoid including outdated entries of experiments
        // which no longer run (or solve at db level)

        const params = entry?.value?.params
        if (!params) {
          logger.warn(`Skipping unexpected entry at ${entry.key}, expected params field`)
          continue
        }

        const labels = {}
        for (const [snakedName, camelName] of labelNamesMap.entries()) {
          const paramValue = params[camelName]
          if (!paramValue) {
            logger.warn(`Skipping unexpected entry at ${entry.key}, no value for param ${camelName}`)
            continue
          }

          labels[snakedName] = paramValue
        }

        // Assumes runtimeS is always a number
        this.labels(labels).set(entry.value.runTimeS)
      }
    } catch (e) {
      logger.error('Error while collecting metrics')
      logger.error(e)
    }
  }
}

function createLabelNamesMap (parametrisations) {
  const labelNamesMap = new Map()

  for (const labelName of Object.keys(parametrisations[0])) {
    const snaked = toSnakeCase(labelName)
    labelNamesMap.set(snaked, labelName)
  }

  return labelNamesMap
}

function toSnakeCase (name) {
  return name.replace(
    /[A-Z]/g,
    letter => `_${letter.toLowerCase()}`
  )
}

module.exports = setupMonitoringServer
