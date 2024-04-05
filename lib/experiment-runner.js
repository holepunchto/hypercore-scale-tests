const ReadyResource = require('ready-resource')
const { WriteTest, ReadTest } = require('./writes')
const safetyCatch = require('safety-catch')
const Corestore = require('corestore')
const fsProm = require('fs/promises')

// TODO:
// - store experiments in the runner
// - store for each experiment how long it ran last time

// TODO: pass in as config
const EXPERIMENTS = [
  {
    className: WriteTest,
    params: {
      nrBlocks: 100000,
      blockByteSize: 1000
    }
  }, {
    className: ReadTest,
    params: {
      nrBlocks: 100000,
      blockByteSize: 1000
    }
  }
]

module.exports = class Runner extends ReadyResource {
  constructor (testInterval, logger, storage) {
    super()

    this.logger = logger
    this.storage = storage || './temp-scale-test-storage'

    this.testInterval = testInterval || 1000 * 25
    this.testTimeout = 60000 * 1000
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

  _open () {
    const runHelper = () => {
      if (this._running) {
        this.logger.warn('Previous experiment still running. Needs a bigger interval?')
        return
      }
      this.currentLoop = this._runExperiment().catch(e => { this.logger.error(e) })
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
      await fsProm.rm(this.storage, { recursive: true })
    } catch (e) {
      this.logger.info(`Error while clearing storage: ${e}`)
    }
  }

  async _runExperiment () { // Should never throw
    if (this.closing) return

    if (this._running != null) {
      this.logger.warn('Previous experiment still running. Needs a bigger interval?')
      return
    }

    const { params, className} = EXPERIMENTS[this._experimentCounter % EXPERIMENTS.length]
    this._experimentCounter++

    await this._clearStorage()
    const store = new Corestore(this.storage)

    const experiment = new className(store, params) // TODO: clean up
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
      experiment.close().catch(safetyCatch)
      resolveTimeout('Experiment finished before timeout')
    }
  }
}
