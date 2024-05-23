const Hyperdrive = require('hyperdrive')
const Corestore = require('corestore')
const Experiment = require('./experiment')

class DriveWriteExperiment extends Experiment {
  constructor (tmpDir, { nrFiles, fileByteSize }) {
    super(tmpDir, 'Drive Write Hyperdrive experiment')

    this.store = new Corestore(this.tmpDir)
    this.drive = new Hyperdrive(this.store)

    this.nrFiles = nrFiles
    this.fileByteSize = fileByteSize

    this.file = 'a'.repeat(this.fileByteSize)
  }

  async _setup () {
    if (this.closing) return
    await this.drive.ready()
  }

  async _runExperiment () {
    let ranAtLeastOnce = false

    for (let i = 0; i < this.nrFiles; i += 1) {
      ranAtLeastOnce = true
      await this.drive.put(`/blob${i}.txt`, this.file)
      if (this.closing) return
    }
    if (!ranAtLeastOnce) throw new Error('Bug in this code: no entry was written')
  }

  async _teardown () {
    await this.drive.close()
    await this.store.close()
  }
}

module.exports = DriveWriteExperiment
