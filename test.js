const test = require('brittle')
const { spawn } = require('child_process')
const goodbye = require('graceful-goodbye')
const b4a = require('b4a')
const tmpDir = require('test-tmp')
const axios = require('axios')

const DEBUG = false

test('end to end test', async t => {
  const storageDir = await tmpDir(t)

  const proc = spawn(
    process.execPath,
    ['run.js'],
    {
      env: {
        HYPERCORE_SCALE_TEST_INTERVAL_MS: '100', // will log warnings that the previous experiment is still running, but helps the test run as fast as possible
        HYPERCORE_SCALE_STORAGE_PATH: storageDir,
        HYPERCORE_SCALE_EXPERIMENTS_FILE_LOC: './example-config.json'
      }
    }
  )

  // Ensure there's no zombie on error
  const unregisterGoodbye = goodbye(() => proc.kill('SIGKILL'))

  let metricsUrl = null
  const tSetup = t.test('setup')
  tSetup.plan(2)

  const tRunExperiments = t.test('run')
  tRunExperiments.plan(1)

  const tProcessDone = t.test('exit')
  tProcessDone.plan(2)

  proc.stdout.on('data', data => {
    data = b4a.toString(data)

    if (DEBUG) console.log(data)

    if (data.includes('Server listening at')) {
      metricsUrl = data.match(/http:\/\/127.0.0.1:[0-9]{4,5}/)[0]
      tSetup.pass('Metrics server launched')
    }

    if (data.includes('Fully setup')) {
      tSetup.pass('Experiment runner setup')
    }

    // Note: this is tightly coupled to the log format,
    // the example-config and the experiment order,
    // so will have to be updated when those change
    const lastExp = 'Finished Write experiment with params: nrBlocks: 10, blockByteSize: 100'
    if (data.includes(lastExp)) {
      tRunExperiments.pass('All experiments ran')
    }

    if (data.includes('Shut down successfully')) {
      tProcessDone.pass('The process cleanly exited')
    }
  })

  proc.stderr.on('data', d => {
    console.error(d.toString())
    t.fail('There is stderr output')
  })

  proc.on('exit', (code) => {
    tProcessDone.pass('Process exited')
  })

  await tSetup
  await tRunExperiments

  const tMetrics = t.test('metric entries')
  tMetrics.plan(8)

  const metrics = (await axios.get(`${metricsUrl}/metrics`)).data
  const expectedEntries = [
    'hypercorescale_download{nr_blocks="10",block_byte_size="10"}',
    'hypercorescale_download{nr_blocks="10",block_byte_size="100"}',
    'hypercorescale_download_read_stream{nr_blocks="10",block_byte_size="10"}',
    'hypercorescale_download_read_stream{nr_blocks="10",block_byte_size="100"}',
    'hypercorescale_read{nr_blocks="10",block_byte_size="10"}',
    'hypercorescale_read{nr_blocks="10",block_byte_size="100"}',
    'hypercorescale_write{nr_blocks="10",block_byte_size="10"} ',
    'hypercorescale_write{nr_blocks="10",block_byte_size="100"}'
  ]

  for (const expected of expectedEntries) {
    tMetrics.is(metrics.includes(expected), true, '/metrics endpoint contains expected entry')
  }

  proc.kill('SIGTERM')

  await tProcessDone

  // Process killed cleanly, so no more need for the goodbye handler
  unregisterGoodbye()
})
