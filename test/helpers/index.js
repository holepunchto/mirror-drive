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
  alike,
  print,
  find
}

async function createDrives (t) {
  const local = new Localdrive(createTmpDir(t), { metadata: createMetadata() })
  const hyper = new Hyperdrive(new Corestore(createTmpDir(t)))

  await setupDrive(local)
  await setupDrive(hyper)

  return { local, hyper }
}

async function setupDrive (drive) {
  /* for await (const file of drive.list()) {
    await drive.del(file.key)
  } */

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
}

function sortObjects (array) {
  return array.map(JSON.stringify).sort()
}

function alike (a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function find (actual, list) {
  for (const expected of list) {
    if (alike(actual, expected)) {
      return true
    }
  }
  return false
}

function print (msg, diff) {
  const o = JSON.parse(JSON.stringify(diff))
  delete o.count
  console.log(msg, o, 'count:', diff.count)
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
