const Hyperdrive = require('hyperdrive')
const Corestore = require('corestore')
const Experiment = require('./experiment')

class DriveGetExperiment extends Experiment {
  constructor (tmpDir, { nrBlocks, blockByteSize }) {
    super(tmpDir, 'Drive Get Hyperdrive experiment')

    this.store = new Corestore(this.tmpDir)
    this.drive = new Hyperdrive(this.store)

    this.nrBlocks = nrBlocks
    this.blockByteSize = blockByteSize

    this.block = 'a'.repeat(this.blockByteSize)
  }

  async _setup () {
    if (this.closing) return
    for (let i = 0; i < this.nrBlocks; i += 1) {
      if (this.closing) return
      await this.drive.put(`/blob${i}.txt`, Buffer.from(this.block))
    }
    await this.drive.ready()
  }

  async _runExperiment () {
    for (let i = 0; i < this.nrBlocks; i += 1) {
      if (this.closing) return
      await this.drive.get(`/blob${i}.txt`)
    }
  }

  async _teardown () {
    await this.drive.close()
    if (this.store) await this.store.close()
  }
}

module.exports = DriveGetExperiment
