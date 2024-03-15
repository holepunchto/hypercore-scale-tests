const setupPeer = require('./setup-peer')
const RAM = require('random-access-memory')
const setupTestnet = require('hyperdht/testnet')
const { setTraceFunction } = require('hypertrace')

async function main() {
  // const nrExtraSeeders = 0
  const nrDownloaders = 1
  const nrBlocks = process.argv[2]
  const nrCores = 1
  console.log('Nr blocks:', nrBlocks, 'nrDownloaders:', nrDownloaders, 'nrCores:', nrCores)

  const testnet = await setupTestnet()
  const bootstrap = testnet.bootstrap

  trace()

  const creator = setupPeer({ bootstrap, storage: RAM.reusable() })
  for (let i = 0; i< nrCores; i++) {
    const storage = `core-${i}-${Math.random()}`
    await creator.createCore(storage, nrBlocks)
  }
  await creator.swarm.flush()
  console.log('Setup creator')

  const downloaders = []
  for (let i = 0; i <nrDownloaders; i++) {
    downloaders.push(setupPeer({ bootstrap, storage: RAM.reusable() }))
  }

  console.log('Core keys:', creator.keys)
  for (const dl of downloaders) {
    for (const key of creator.keys) await dl.downloadCore(key)
  }
  console.log('Setup downloaders')
}

function trace () {
  const counters = {}
  setTraceFunction(({ id, caller, object, parentObject }) => {
    const uid = `${object.className}-${id}`
    counters[uid] = (counters[uid] || 0) + 1
  })

  setInterval(() => console.log(counters), 1000)

}

main()
