const ReadyResource = require('ready-resource')
const safetyCatch = require('safety-catch')
const fsProm = require('fs/promises')
const path = require('path')
const SubEncoder = require('sub-encoder')

module.exports = class Runner extends ReadyResource {
  constructor (experiments, resBee, logger, { testInterval, tempStorageDir } = {}) {
    super()

    this.logger = logger
    this.tmpStorageDir = tempStorageDir || './temp-scale-test-storage'
    this.resBee = resBee
    this.experiments = experiments

    this.testInterval = testInterval || 10 * 60 * 1000
    this.testTimeout = 30 * 60 * 1000
    this.lastRunTime = null

    this._experimentCounter = 0
    this._running = null
    this._currentLoop = null

    this._forceShutdown = null
    this._shutdownProm = new Promise((resolve, reject) => {
      this._forceShutdown = reject
    })
    this._shutdownProm.catch(safetyCatch)

    this._intervalRunner = null
  }

  async _open () {
    await this._clearStorage()
    await fsProm.mkdir(this.tmpStorageDir)

    const runHelper = () => {
      if (this._running) {
        this.logger.warn('Previous experiment still running. Needs a bigger interval?')
        return
      }
      this.currentLoop = this._runExperiment().catch(e => {
        safetyCatch(e)
        this.logger.error('Unexpected error in _runExperiment')
        this.logger.error(e)
      })
    }

    setImmediate(runHelper) // Let _open finish first
    this._intervalId = setInterval(runHelper, this.testInterval)
  }

  async _close () {
    clearInterval(this._intervalId)
    this._forceShutdown(new Error('Shutting down'))
    if (this.currentLoop) await this.currentLoop
    await this._clearStorage()
  }

  async _clearStorage () {
    try {
      await fsProm.rm(this.tmpStorageDir, { recursive: true })
    } catch (e) {
      this.logger.info(`Error while clearing temporary storage: ${e}`)
    }
  }

  async _runExperiment () { // Should never throw
    if (this.closing) return

    if (this._running != null) {
      this.logger.warn('Previous experiment still running. Needs a bigger interval?')
      return
    }

    const experimentNr = this._experimentCounter % this.experiments.length
    const { params, experimentClass, name } = this.experiments[experimentNr]
    this._experimentCounter++

    const tmpDir = path.join(this.tmpStorageDir, `experiment-${this._experimentCounter}`)
    const experiment = new experimentClass(tmpDir, params) // eslint-disable-line new-cap

    let info = `${experiment.name} with params: `
    for (const [name, value] of Object.entries(params)) {
      info += `${name}: ${value}, `
    }
    info = info.slice(0, info.length - 2)

    let resolveTimeout
    const timeoutProm = new Promise((resolve, reject) => {
      setTimeout(
        () => reject(
          new Error(`Experiment timeout after ${this.testTimeout / 1000}s`)
        ),
        this.testTimeout
      )
      resolveTimeout = resolve
    })
    timeoutProm.catch(safetyCatch)

    try {
      this.logger.info(`Running ${info}`)
      this._running = experiment.runExperiment()

      // State machine:
      // Happy flow = _running resolves.
      //      => Finished experiment before timeoutProm triggers
      //      => timeout promise is cleaned up
      // Unhappy flows:
      //  _shutdownProm rejects: the runner is shutting down.
      //      => End immediately, we don't care about cleaning up
      //  timeoutProm rejects: did not finish experiment in time
      //      => Stop the experiment, but clean it up in the background
      //          (relies on the experiment implementing a sensible close method,
      //          which stops the experiment during its run)

      this.lastRunTime = await Promise.race([
        this._running,
        this._shutdownProm,
        timeoutProm
      ])

      this.lastSucceeded = true
      this.logger.info(`Finished ${info} in ${experiment.runTime / 1000}s`)
    } catch (e) {
      this.logger.error(`${info} failed: ${e}`)
      this.lastRunTime = null
      this.lastSucceeded = false
    } finally {
      this._running = null
      experiment.close().catch((e) => {
        safetyCatch(e)
        this.logger.info(`Error while closing experiment: ${e}`)
      })
      resolveTimeout('Experiment finished before timeout')
    }

    if (this.closing) return

    const experimentKey = getExperimentKey(params)

    await this.resBee.put(
      experimentKey,
      {
        success: this.lastSucceeded,
        runTimeS: this.lastRunTime ? this.lastRunTime / 1000 : -1,
        params,
        name: experiment.name,
        timestamp: Date.now()
      },
      {
        keyEncoding: (new SubEncoder()).sub(name)
      }
    )
  }
}

// Note: Should be unique based on the params
function getExperimentKey (params) {
  let experimentKey = ''
  for (const [key, value] of Object.entries(params)) {
    experimentKey += `${key}=${value}_`
  }
  experimentKey = experimentKey.slice(0, experimentKey.length - 1)

  return experimentKey
}
