const test = require('brittle')
const { createDrives, changeDrive, sortObjects, toArray } = require('./helpers/index.js')
const mirror = require('../index.js')

test('mirror localdrive into hyperdrive', async function (t) {
  const { local, hyper } = await createDrives(t)

  const actual = []
  const expected = await changeDrive(local)

  const m = mirror(local, hyper, { allOps: true })
  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })

  for await (const diff of m) {
    delete diff.count
    actual.push(diff)
  }

  t.alike(m.count, { files: 6, add: 1, remove: 1, change: 3 })
  t.alike(sortObjects(actual), sortObjects(expected))

  const m2 = mirror(local, hyper)
  const diffs = await toArray(m2)
  t.is(diffs.length, 0)
})

test('mirror hyperdrive into localdrive', async function (t) {
  const { local, hyper } = await createDrives(t)

  const actual = []
  const expected = await changeDrive(hyper)

  const m = mirror(hyper, local, { allOps: true })
  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })

  for await (const diff of m) {
    delete diff.count
    actual.push(diff)
  }

  t.alike(m.count, { files: 6, add: 1, remove: 1, change: 3 })
  t.alike(sortObjects(actual), sortObjects(expected))

  const m2 = mirror(hyper, local)
  const diffs = await toArray(m2)
  t.is(diffs.length, 0)
})

test('prune disabled', async function (t) {
  const { local, hyper } = await createDrives(t)

  const actual = []
  const expected = (await changeDrive(local)).filter(exp => exp.op !== 'remove')

  const m = mirror(local, hyper, { prune: false, allOps: true })
  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })

  for await (const diff of m) {
    delete diff.count
    actual.push(diff)
  }

  t.alike(m.count, { files: 6, add: 1, remove: 0, change: 3 })
  t.alike(sortObjects(actual), sortObjects(expected))

  const m2 = mirror(local, hyper)
  const diffs = await toArray(m2)
  t.is(diffs.length, 1)
  t.alike(diffs[0], { op: 'remove', key: '/tmp.txt', bytesRemoved: 4, bytesAdded: 0 })
})
