const ReadyResource = require('ready-resource')
const safetyCatch = require('safety-catch')
const fsProm = require('fs/promises')

/*
  State machine:
  - Experiment gets created as a new Experiment instance
  - runExperiment() is called. It should be called exactly once
  - The tmp dir is created, and the readyResource enters ready state.
  - _setup() runs
      =>  here lives the logic needed to setup the experiment
          but that should NOT be counted to the experiment runtime
      =>  this method should detect when it is closing, and early-return in that case
          to make the experiment quickly cancellable
  - _runExperiment() runs
      =>  the actual experiment, for which the runtime is measured
      =>  this method should detect when it is closing, and early-return in that case
          to make the experiment quickly cancellable
  - _close() runs, to clean up the experiment
      => awaits _runExperiment (which should detect it's closing and quickly finish)
      => calls the experiment's _teardown() method for potential custom close logic
      => removes the tmp dir
      Note: if close errors, the tmp dir might not get cleaned up. But it will eventually get cleaned up by the Runner

  if close() is called at any time during the experiment, the test stops and cleans itself up
    =>  this depends on the _setup() and _runExperiment() methods being well-behaved
*/

class Experiment extends ReadyResource {
  constructor (tmpDir, name) {
    super()

    this.tmpDir = tmpDir
    this.name = name

    this.startTime = null
    this.endTime = null
    this._runningProm = null
  }

  async _open () {
    await fsProm.mkdir(this.tmpDir)
  }

  async _close () {
    this.emit('closing')
    await this._runningProm
    await this._teardown()
    await fsProm.rm(this.tmpDir, { recursive: true })
  }

  // Implement in subclass
  async _setup () { }

  // Implement in subclass
  async _runExperiment () {
    throw new Error('Not implemented ')
  }

  // Implement in subclass
  async _teardown () { }

  get runTime () {
    return this.endTime ? this.endTime - this.startTime : -1
  }

  async runExperiment () {
    // TODO: should either not care, or detect more aggressively (startTime set after _setup)
    if (this.startTime !== null) throw new Error('Already ran')

    await this.ready()
    await this._setup()
    if (this.closing) return

    this.startTime = Date.now()
    await this._runExperiment()
    this.endTime = Date.now()

    this.close().catch(safetyCatch)
    return this.runTime
  }
}

module.exports = Experiment
