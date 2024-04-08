const ReadyResource = require('ready-resource')
const safetyCatch = require('safety-catch')

/*
  State machine:
  - Experiment gets created as a new WriteTest instance
  - runExperiment() is called. It can be called exactly once
  - the readyResource enters ready state.
      => This should be fast, ideally no logic lives in _open
         because the experiment can't be cancelled while it runs
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

  if close() is called at any time during the experiment, the test stops and cleans itself up
    =>  this depends on the _setup() and _runExperiment() methods being well-behaved
*/

class Experiment extends ReadyResource {
  constructor (store, name) {
    super()

    this.store = store
    this.name = name

    this.startTime = null
    this.endTime = null
    this._runningProm = null
  }

  async _open () {
    await this.store.ready()
  }

  async _close () {
    await this._runningProm
    await this.store.close()
  }

  // Implement in subclass
  async _setup () { }

  // Implement in subclass
  async _runExperiment () { }

  get runTime () {
    return this.endTime ? this.endTime - this.startTime : -1
  }

  async runExperiment () {
    // TODO: should detect more aggressively (startTime set after _setup)
    if (this.startTime !== null) throw new Error('Already ran')

    await this.ready()
    await this._setup()
    if (this.closing) return

    this.startTime = new Date()
    await this._runExperiment()
    this.endTime = new Date()

    this.close().catch(safetyCatch)
    return this.runTime
  }
}

module.exports = Experiment
