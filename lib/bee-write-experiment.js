const Hyperbee = require('hyperbee')
const Hypercore = require('hypercore')
const Experiment = require('./experiment')

class BeeWriteExperiment extends Experiment {
  constructor (tmpDir, { nrEntries, entryByteSize }) {
    super(tmpDir, 'Bee Write Hyperdrive experiment')

    this.core = new Hypercore(this.tmpDir)
    this.db = new Hyperbee(this.core)

    this.nrEntries = nrEntries
    this.entryByteSize = entryByteSize

    this.node = 'a'.repeat(this.entryByteSize)
  }

  async _setup () {
    if (this.closing) return
    await this.db.ready()
  }

  async _runExperiment () {
    for (let i = 0; i < this.nrEntries; i += 1) {
      await this.db.put(`key${i}`, this.node)
      if (this.closing) return
    }
    if (this.db.version <= 1) throw new Error('Bug in this code: no entry was written')
  }

  async _teardown () {
    await this.db.close()
  }
}

module.exports = BeeWriteExperiment
