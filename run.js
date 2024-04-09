const pino = require('pino')
const Runner = require('./lib/experiment-runner')
const goodbye = require('graceful-goodbye')
const Hyperbee = require('hyperbee')
const Corestore = require('corestore')

const setupMonitoringServer = require('./lib/metrics')
const WriteExperiment = require('./lib/write-experiment')
const ReadExperiment = require('./lib/read-experiment')
const ReadStreamDownloadExperiment = require('./lib/read-stream-download-experiment')

const EXPERIMENTS = [
  {
    experimentClass: ReadStreamDownloadExperiment,
    params: {
      nrBlocks: 100 * 1000,
      blockByteSize: 1000
    },
    name: 'stream_download_100k_blocks_of_1kb',
    description: 'download 100K blocks of 1kb (100Mb) over a readstream'
  },
  {
    experimentClass: ReadStreamDownloadExperiment,
    params: {
      nrBlocks: 10 * 1000,
      blockByteSize: 10 * 1000
    },
    name: 'stream_download_10k_blocks_of_10kb',
    description: 'download 10K blocks of 10kb (100Mb) over a readstream'
  },
  {
    experimentClass: ReadStreamDownloadExperiment,
    params: {
      nrBlocks: 1000,
      blockByteSize: 100 * 1000
    },
    name: 'stream_download_1k_blocks_of_100kb',
    description: 'download 1K blocks of 100kb (100Mb) over a readstream'
  },
  {
    experimentClass: WriteExperiment,
    params: {
      nrBlocks: 100 * 1000,
      blockByteSize: 1000
    },
    name: 'write_100k_blocks_of_1kb',
    description: 'write 100K hypercore blocks of 1kb to disk (100Mb)'
  },
  {
    experimentClass: WriteExperiment,
    params: {
      nrBlocks: 10 * 1000,
      blockByteSize: 10 * 1000
    },
    name: 'write_10k_blocks_of_10kb',
    description: 'write 10K hypercore blocks of 10kb to disk (100Mb)'
  },
  {
    experimentClass: WriteExperiment,
    params: {
      nrBlocks: 1 * 1000,
      blockByteSize: 100 * 1000
    },
    name: 'write_1k_blocks_of_100kb',
    description: 'write 1K hypercore blocks of 100kb to disk (100mb)'
  },
  {
    experimentClass: WriteExperiment,
    params: {
      nrBlocks: 100,
      blockByteSize: 1000 * 1000
    },
    name: 'write_100_blocks_of_1mb',
    description: 'write 100 hypercore blocks of 1mb to disk (100mb)'
  },
  {
    experimentClass: ReadExperiment,
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
    testInterval: process.env.HYPERCORE_SCALE_TEST_INTERVAL_MS || 1000 * 60 * 5,
    storage: process.env.HYPERCORE_SCALE_STORAGE_PATH || 'hypercore-scale-corestore'
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

main()
