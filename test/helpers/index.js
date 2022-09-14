const path = require('path')
const os = require('os')
const fs = require('fs')
const fsp = require('fs/promises')
const Localdrive = require('localdrive')
const Hyperdrive = require('hyperdrive')
const Corestore = require('corestore')

module.exports = {
  createDrives,
  changeDrive,
  sortObjects,
  toArray,
  alike
}

async function createDrives (t, opts) {
  const local = new Localdrive(createTmpDir(t), { metadata: createMetadata(), ...opts })
  const hyper = new Hyperdrive(new Corestore(createTmpDir(t)))

  await setupDrive(local)
  await setupDrive(hyper)

  return { local, hyper }
}

async function setupDrive (drive) {
  await drive.put('/equal.txt', Buffer.from('same'))
  await drive.put('/equal-meta.txt', Buffer.from('same'), { metadata: 'same' })

  await drive.put('/buffer.txt', Buffer.from('same'))
  await drive.put('/meta.txt', Buffer.from('same'), { metadata: 'same' })

  await drive.put('/add-meta.txt', Buffer.from('same'))
  await drive.put('/tmp.txt', Buffer.from('same'))
}

async function changeDrive (drive) {
  await drive.put('/new.txt', Buffer.from('add'))
  await drive.put('/buffer.txt', Buffer.from('edit'))
  await drive.put('/meta.txt', Buffer.from('same'), { metadata: 'edit' })
  await drive.put('/add-meta.txt', Buffer.from('same'), { metadata: 'add' })
  await drive.del('/tmp.txt')

  return [
    { op: 'remove', key: '/tmp.txt', bytesRemoved: 4, bytesAdded: 0 },
    { op: 'change', key: '/add-meta.txt', bytesRemoved: 4, bytesAdded: 4 },
    { op: 'change', key: '/buffer.txt', bytesRemoved: 4, bytesAdded: 4 },
    { op: 'equal', key: '/equal-meta.txt', bytesRemoved: 0, bytesAdded: 0 },
    { op: 'equal', key: '/equal.txt', bytesRemoved: 0, bytesAdded: 0 },
    { op: 'change', key: '/meta.txt', bytesRemoved: 4, bytesAdded: 4 },
    { op: 'add', key: '/new.txt', bytesRemoved: 0, bytesAdded: 3 }
  ]
}

function sortObjects (array) {
  return array.map(JSON.stringify).sort()
}

function alike (a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

async function toArray (iterator) {
  const array = []
  for await (const value of iterator) {
    array.push(value)
  }
  return array
}

function createMetadata () {
  const kv = new Map()
  return {
    get: (key) => kv.has(key) ? kv.get(key) : null,
    put: (key, value) => kv.set(key, value),
    del: (key) => kv.delete(key)
  }
}

function createTmpDir (t) {
  const tmpdir = path.join(os.tmpdir(), 'mirror-drive-test-')
  const dir = fs.mkdtempSync(tmpdir)
  t.teardown(() => fsp.rm(dir, { recursive: true }))
  return dir
}
