const Hyperdrive = require('hyperdrive')
const Corestore = require('corestore')

const store = new Corestore('./storage')
const drive = new Hyperdrive(store)

const main = async () => { 
  await drive.put('/blob.txt', Buffer.from('example'))

  const buffer = await drive.get('/blob.txt')
  console.log(buffer)

  const entry = await drive.entry('/blob.txt')
  console.log(entry)
}

main()



