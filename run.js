const pino = require('pino')
const Runner = require('./lib/experiment-runner')
const goodbye = require('graceful-goodbye')
const Hyperbee = require('hyperbee')
const Corestore = require('corestore')
const fsProm = require('fs/promises')

const setupMonitoringServer = require('./lib/metrics')
const WriteExperiment = require('./lib/write-experiment')
const ReadExperiment = require('./lib/read-experiment')
const ReadStreamDownloadExperiment = require('./lib/read-stream-download-experiment')
const DownloadExperiment = require('./lib/download-experiment')
const DriveGetExperiment = require('./lib/drive-get-experiment')

function loadConfig () {
  const res = {
    metricsPort: parseInt(process.env.HYPERCORE_SCALE_METRICS_PORT || 0),
    metricsHost: process.env.HYPERCORE_SCALE_METRICS_HOST || '127.0.0.1',
    testInterval: parseInt(process.env.HYPERCORE_SCALE_TEST_INTERVAL_MS || 1000 * 60 * 5),
    storage: process.env.HYPERCORE_SCALE_STORAGE_PATH || 'hypercore-scale-corestore',
    experimentsConfigLoc: process.env.HYPERCORE_SCALE_EXPERIMENTS_FILE_LOC || 'config.json'
  }

  return res
}

async function main () {
  const config = loadConfig()
  const logger = pino()

  logger.info(`Using storage ${config.storage}`)

  logger.info(`Loading experiment config from ${config.experimentsConfigLoc}`)
  const experimentConfig = JSON.parse(
    await fsProm.readFile(config.experimentsConfigLoc)
  )
  Object.freeze(experimentConfig)

  const experiments = await parseExperimentsConfig(experimentConfig)

  const store = new Corestore(config.storage)
  const resBee = new Hyperbee(
    store.get({ name: 'res-bee' }),
    {
      keyEncoding: 'utf-8',
      valueEncoding: 'json'
    }
  )

  const runner = new Runner(
    experiments,
    resBee,
    logger,
    { testInterval: config.testInterval }
  )

  const server = setupMonitoringServer(resBee, experimentConfig, logger)

  goodbye(async () => {
    logger.info('Closing runner')
    if (runner.opening) await runner.close()

    logger.info('Closing server')
    await server.close()
    logger.info('Shut down successfully')
  })

  server.listen({ host: config.metricsHost, port: config.metricsPort })

  await runner.ready()
  logger.info('Fully setup')
}

async function parseExperimentsConfig (config) {
  const experiments = []

  for (const expConfig of config.readHyperdrive) {
    const params = {
      nrBlocks: expConfig.nrBlocks,
      blockByteSize: expConfig.blockByteSize
    }

    experiments.push({
      experimentClass: DriveGetExperiment,
      params,
      name: 'read_hyperdrive',
      description: 'Read Hyperdrive files'
    })
  }

  for (const expConfig of config.download) {
    const params = {
      nrBlocks: expConfig.nrBlocks,
      blockByteSize: expConfig.blockByteSize
    }

    experiments.push({
      experimentClass: DownloadExperiment,
      params,
      name: 'download',
      description: 'Download blocks using a download range'
    })
  }

  for (const expConfig of config.downloadReadStream) {
    const params = {
      nrBlocks: expConfig.nrBlocks,
      blockByteSize: expConfig.blockByteSize
    }

    experiments.push({
      experimentClass: ReadStreamDownloadExperiment,
      params,
      name: 'download_read_stream',
      description: 'download blocks over a readstream'
    })
  }

  for (const expConfig of config.read) {
    const params = {
      nrBlocks: expConfig.nrBlocks,
      blockByteSize: expConfig.blockByteSize
    }

    experiments.push({
      experimentClass: ReadExperiment,
      params,
      name: 'read',
      description: 'read blocks from file'
    })
  }

  for (const expConfig of config.write) {
    const params = {
      nrBlocks: expConfig.nrBlocks,
      blockByteSize: expConfig.blockByteSize
    }

    experiments.push({
      experimentClass: WriteExperiment,
      params,
      name: 'write',
      description: 'write blocks to file'
    })
  }

  return experiments
}

main()
