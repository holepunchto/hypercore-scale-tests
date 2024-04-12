const Experiment = require('./experiment')
const setupTestnet = require('hyperdht/testnet')
const idEnc = require('hypercore-id-encoding')
const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const safetyCatch = require('safety-catch')
const path = require('path')
const ReadyResource = require('ready-resource')

class DownloadExperiment extends Experiment {
  constructor (tmpDir, { nrBlocks, blockByteSize }) {
    super(tmpDir, 'Download experiment')

    this.nrBlocks = nrBlocks
    this.blockByteSize = blockByteSize

    this.creator = null
    this.downloader = null

    this.block = 'a'.repeat(this.blockByteSize)

    this.swarm = null
    this.testnet = null
  }

  async _setup () {
    const testnet = await setupTestnet()
    const bootstrap = testnet.bootstrap

    this.creator = await setupPeer(bootstrap, path.join(this.tmpDir, 'creator'))
    if (this.closing) return

    await this.creator.createCore(
      'core', this.nrBlocks, this.blockByteSize, this
    )
    if (this.closing) return

    this.downloader = await setupPeer(bootstrap, path.join(this.tmpDir, 'downloader'))
  }

  async _runExperiment () {
    const downloadProms = []
    for (const key of this.creator.keys) {
      downloadProms.push(
        this.downloader.downloadCore(key, this.nrBlocks, this)
      )
    }

    await Promise.all(downloadProms)
  }

  async _teardown () {
    if (this.creator) await this.creator.close()
    if (this.streamer) await this.streamer.close()
  }
}

async function setupPeer (bootstrap, storageDir) {
  const swarm = new Hyperswarm({ bootstrap })
  const store = new Corestore(storageDir)

  swarm.on('connection', (conn, info) => {
    store.replicate(conn)
    conn.on('error', safetyCatch)
  })

  const peer = new Peer(swarm, store)
  await peer.ready()

  return peer
}

class Peer extends ReadyResource {
  // TODO: BasePeer class with just a createCore method, shared with
  // other download experiments
  constructor (swarm, store) {
    super()

    this.swarm = swarm
    this.store = store
    this.cores = new Map()
  }

  async _open () {
    await this.store.ready()
  }

  async _close () {
    await this.swarm.destroy()
    await this.store.close()
  }

  get keys () {
    return [...this.cores.keys()]
  }

  async downloadCore (key, coreLength, experiment, { linear = false } = {}) {
    const core = this.store.get({ key: idEnc.decode(key) })
    await core.ready()

    if (core.contiguousLength !== 0) {
      throw new Error('Sanity check failed: core contiguous length not 0 before downloading. Error in this code?')
    }

    const download = core.download({ start: 0, end: coreLength, linear })

    this.swarm.join(core.discoveryKey, { server: false, client: true })

    const forceStopProm = new Promise((resolve, reject) => {
      // experiment closing before we finished => abort fast
      experiment.on('closing', () => {
        download.destroy()
        reject(new Error('Force closing the download experiment'))
      })
    })
    // We only care if it triggers during the race
    // (it's expected to reject when the experiment closes)
    forceStopProm.catch(safetyCatch)

    await Promise.race([download.done(), forceStopProm])

    if (core.length !== coreLength || core.contiguousLength !== coreLength) {
      throw new Error('Sanity check failed: did not download all blocks. Error in this code?')
    }
  }

  async createCore (name, nrBlocks, blockSizeBytes = 1000, experiment) {
    const core = this.store.get({ name })
    await core.ready()
    this.cores.set(idEnc.normalize(core.key), core)

    for (let i = 0; i < nrBlocks; i++) {
      // TODO: ensure there's no compression at transport level
      const block = 'a'.repeat(blockSizeBytes)
      await core.append(block)
      if (experiment.closing) return
    }

    this.swarm.join(core.discoveryKey, { server: true, client: true })
  }
}

module.exports = DownloadExperiment
