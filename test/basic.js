const test = require('brittle')
const { createDrives, changeDrive, sortObjects } = require('./helpers/index.js')
const mirror = require('../index.js')

test('mirror localdrive into hyperdrive', async function (t) {
  const { local, hyper } = await createDrives(t)

  await changeDrive(local)

  const actual = []
  const expected = [
    { op: 'remove', key: '/tmp.txt', bytesRemoved: 4, bytesAdded: 0 },
    { op: 'change', key: '/add-meta.txt', bytesRemoved: 4, bytesAdded: 4 },
    { op: 'change', key: '/buffer.txt', bytesRemoved: 4, bytesAdded: 4 },
    { op: 'equal', key: '/equal-meta.txt', bytesRemoved: 0, bytesAdded: 0 },
    { op: 'equal', key: '/equal.txt', bytesRemoved: 0, bytesAdded: 0 },
    { op: 'change', key: '/meta.txt', bytesRemoved: 4, bytesAdded: 4 },
    { op: 'add', key: '/new.txt', bytesRemoved: 0, bytesAdded: 3 }
  ]

  const m = mirror(local, hyper, { allOps: true })

  for await (const diff of m) {
    delete diff.count
    actual.push(diff)
  }

  t.alike(m.count, { files: 6, add: 1, remove: 1, change: 3 })
  t.alike(sortObjects(actual), sortObjects(expected))
})

test('mirror hyperdrive into localdrive', async function (t) {
  const { local, hyper } = await createDrives(t)

  await changeDrive(hyper)

  const actual = []
  const expected = [
    { op: 'remove', key: '/tmp.txt', bytesRemoved: 4, bytesAdded: 0 },
    { op: 'change', key: '/add-meta.txt', bytesRemoved: 4, bytesAdded: 4 },
    { op: 'change', key: '/buffer.txt', bytesRemoved: 4, bytesAdded: 4 },
    { op: 'equal', key: '/equal-meta.txt', bytesRemoved: 0, bytesAdded: 0 },
    { op: 'equal', key: '/equal.txt', bytesRemoved: 0, bytesAdded: 0 },
    { op: 'change', key: '/meta.txt', bytesRemoved: 4, bytesAdded: 4 },
    { op: 'add', key: '/new.txt', bytesRemoved: 0, bytesAdded: 3 }
  ]

  const m = mirror(hyper, local, { allOps: true })

  for await (const diff of m) {
    delete diff.count
    actual.push(diff)
  }

  t.alike(m.count, { files: 6, add: 1, remove: 1, change: 3 })
  t.alike(sortObjects(actual), sortObjects(expected))
})
