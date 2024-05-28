const Hyperbee = require('hyperbee')
const Hypercore = require('hypercore')
const RAM = require('random-access-memory')
const Experiment = require('./experiment')

class BeeWriteExperiment extends Experiment {
  constructor (tmpDir, { nrEntries, entryByteSize }) {
    super(tmpDir, 'Bee Write Hyperdrive experiment')

    this.core = new Hypercore(RAM)
    this.db = new Hyperbee(this.core)

    this.nrEntries = nrEntries
    this.entryByteSize = entryByteSize

    this.node = 'a'.repeat(this.fileByteSize)
  }

  async _setup () {
    if (this.closing) return
    await this.db.ready()
  }

  async _runExperiment () {
    let ranAtLeastOnce = false

    for (let i = 0; i < this.nrEntries; i += 1) {
      ranAtLeastOnce = true
      await this.db.put(`key${i}`, this.node)
      if (this.closing) return
    }
    if (!ranAtLeastOnce) throw new Error('Bug in this code: no entry was written')
  }

  async _teardown () {
    await this.db.close()
    await this.core.close()
  }
}

module.exports = BeeWriteExperiment
