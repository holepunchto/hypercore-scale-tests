const ReadyResource = require('ready-resource')
const runWriteTest = require('./writes')

module.exports = class Runner extends ReadyResource {
  constructor (testInterval, logger) {
    super()

    // TODO: allow specifying a config, indicating which
    // tests to run, and with which params
    this.logger = logger

    this.testInterval = testInterval || 1000 * 25
    this.lastRunTime = null
    this.params = {
      nrBlocks: 100000,
      blockByteSize: 1000
    }
    let info = ''
    for (const [name, value] of Object.entries(this.params)) {
      info += `${name}: ${value}, `
    }
    this.info = info.slice(0, info.length - 2)

    this._running = null
    this._currentLoop = null

    this._resolveShutdown = null
    this._shutdownProm = new Promise(resolve => {
      this._resolveShutdown = resolve
    })

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
    this._resolveShutdown()
    console.log('awaiting running')
    if (this.currentLoop) await this.currentLoop
    console.log('done awaiting running')
  }

  async _runExperiment () { // Should never throw
    if (this.closing) return

    if (this._running != null) {
      this.logger.warn('Previous experiment still running. Needs a bigger interval?')
      return
    }

    try {
      this.logger.info(`Running write experiment with params ${this.info}`)

      this._running = runWriteTest(this.params)
      this.lastRunTime = await Promise.race([
        this._running,
        this._shutdownProm
      ])

      this.lastSucceeded = true
      this.logger.info(`Finished write experiment with params ${this.info}`)
    } catch (e) {
      this.logger.error(`Write experiment failed: ${e}`)
      this.lastRunTime = null
      this.lastSucceeded = false
    } finally {
      console.log('setting running to null')
      this._running = null
    }
  }
}
