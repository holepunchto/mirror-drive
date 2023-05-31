const test = require('brittle')
const { createDrives, changeDrive, sortObjects, toArray } = require('./helpers/index.js')
const MirrorDrive = require('../index.js')
const b4a = require('b4a')

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

test('mirror into a readonly drive', async function (t) {
  const { local, hyper } = await createDrives(t, null, { setup: false, key: b4a.alloc(32) })

  await local.put('/tmp.txt', b4a.from('hello'))

  const m = new MirrorDrive(local, hyper)

  try {
    await m.done()
    t.fail('should have failed to mirror')
  } catch (error) {
    t.is(error.message, 'Destination must be writable')
  }
})

test('mirror a drive but file got quickly deleted', async function (t) {
  const { local, hyper } = await createDrives(t, null, { setup: false })

  await local.put('/LICENSE', b4a.from('MIT'))
  await local.put('/extra-file', b4a.from('hi'))

  await hyper.put('/LICENSE', b4a.from('MIT'))

  const actual = []
  const expected = [
    { op: 'equal', key: '/LICENSE', bytesRemoved: 0, bytesAdded: 0 },
    { op: 'add', key: '/extra-file', bytesRemoved: 0, bytesAdded: 2 },
    { op: 'remove', key: '/extra-file', bytesRemoved: 2, bytesAdded: 0 }
  ]

  const m = new MirrorDrive(local, hyper, { includeEquals: true })

  for await (const diff of m) {
    if (diff.op === 'add' && diff.key === '/extra-file') {
      await local.del(diff.key)
    }

    delete diff.count
    actual.push(diff)
  }

  const toKey = (entry) => entry.key
  t.alike((await toArray(local.list())).map(toKey), ['/LICENSE'])
  t.alike((await toArray(hyper.list())).map(toKey), ['/LICENSE'])

  t.alike(m.count, { files: 2, add: 1, remove: 1, change: 0 })
  t.is(m.bytesRemoved, 2)
  t.is(m.bytesAdded, 2)
  t.alike(sortObjects(actual), sortObjects(expected))
})
