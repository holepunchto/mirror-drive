const test = require('brittle')
const { createDrives, changeDrive, sortObjects, toArray, createTmpDir } = require('./helpers/index.js')
const MirrorDrive = require('../index.js')
const Localdrive = require('localdrive')
const Hyperdrive = require('hyperdrive')
const Corestore = require('corestore')

test('mirror localdrive into hyperdrive', async function (t) {
  const { local, hyper } = await createDrives(t)

  const actual = []
  const expected = await changeDrive(local)

  const m = new MirrorDrive(local, hyper, { includeEquals: true })
  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })
  t.is(m.bytesRemoved, 0)
  t.is(m.bytesAdded, 0)

  for await (const diff of m) {
    delete diff.count
    actual.push(diff)
  }

  t.alike(m.count, { files: 6, add: 1, remove: 1, change: 3 })
  t.is(m.bytesRemoved, 16)
  t.is(m.bytesAdded, 15)
  t.alike(sortObjects(actual), sortObjects(expected))

  const m2 = new MirrorDrive(local, hyper)
  const diffs = await toArray(m2)
  t.is(diffs.length, 0)
})

test('mirror hyperdrive into localdrive', async function (t) {
  const { local, hyper } = await createDrives(t)

  const actual = []
  const expected = await changeDrive(hyper)

  const m = new MirrorDrive(hyper, local, { includeEquals: true })
  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })
  t.is(m.bytesRemoved, 0)
  t.is(m.bytesAdded, 0)

  for await (const diff of m) {
    delete diff.count
    actual.push(diff)
  }

  t.alike(m.count, { files: 6, add: 1, remove: 1, change: 3 })
  t.is(m.bytesRemoved, 16)
  t.is(m.bytesAdded, 15)
  t.alike(sortObjects(actual), sortObjects(expected))

  const m2 = new MirrorDrive(hyper, local)
  const diffs = await toArray(m2)
  t.is(diffs.length, 0)
})

test('prune disabled', async function (t) {
  const { local, hyper } = await createDrives(t)

  const actual = []
  const expected = (await changeDrive(local)).filter(exp => exp.op !== 'remove')

  const m = new MirrorDrive(local, hyper, { prune: false, includeEquals: true })
  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })
  t.is(m.bytesRemoved, 0)
  t.is(m.bytesAdded, 0)

  for await (const diff of m) {
    delete diff.count
    actual.push(diff)
  }

  t.alike(m.count, { files: 6, add: 1, remove: 0, change: 3 })
  t.is(m.bytesRemoved, 12)
  t.is(m.bytesAdded, 15)
  t.alike(sortObjects(actual), sortObjects(expected))

  const m2 = new MirrorDrive(local, hyper)
  const diffs = await toArray(m2)
  t.is(diffs.length, 1)
  t.alike(diffs[0], { op: 'remove', key: '/tmp.txt', bytesRemoved: 4, bytesAdded: 0 })
})

test.solo('hyperdrive with custom key', async function (t) { // + b4a
  t.plan(1)

  const key = Buffer.from('6ee2dfe60728087cc9ec0698a79ee0a148df2c96f516dd684461af92fcb798de', 'hex')

  const local = new Localdrive(createTmpDir(t), { metadata: new Map() })
  const store = new Corestore(createTmpDir(t))
  const hyper = new Hyperdrive(store, key)

  t.teardown(() => local.close())
  t.teardown(() => hyper.close())

  await local.put('/app.js', Buffer.from('console.log("hello")'))

  const m = new MirrorDrive(local, hyper)
  await m.done()

  t.is(m.count.files, 1)
})
