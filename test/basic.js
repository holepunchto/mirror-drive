const test = require('brittle')
const { createDrives, changeDrive, sortObjects, toArray } = require('./helpers/index.js')
const unixPathResolve = require('unix-path-resolve')
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

test('mirror with entries option', async function (t) {
  const { local, hyper } = await createDrives(t)

  const entries = ['/tmp.txt', '/buffer.txt', '/equal.txt', '/new.txt']
  const actual = []
  const expected = (await changeDrive(local)).filter(v => entries.indexOf(v.key) > -1)

  const m = new MirrorDrive(local, hyper, { includeEquals: true, entries })

  for await (const diff of m) {
    delete diff.count
    actual.push(diff)
  }

  t.alike(m.count, { files: 3, add: 1, remove: 1, change: 1 })
  t.is(m.bytesRemoved, 8)
  t.is(m.bytesAdded, 7)
  t.alike(sortObjects(actual), sortObjects(expected))

  const actual2 = []
  const expected2 = [
    { op: 'change', key: '/add-meta.txt', bytesRemoved: 4, bytesAdded: 4 },
    { op: 'change', key: '/meta.txt', bytesRemoved: 4, bytesAdded: 4 }
  ]

  const m2 = new MirrorDrive(local, hyper)

  for await (const diff of m2) {
    delete diff.count
    actual2.push(diff)
  }

  t.alike(m2.count, { files: 6, add: 0, remove: 0, change: 2 })
  t.is(m2.bytesRemoved, 8)
  t.is(m2.bytesAdded, 8)
  t.alike(sortObjects(actual2), sortObjects(expected2))
})

test('mirror localdrive into hyperdrive with ignores', async function (t) {
  const { local } = await createDrives(t)
  const { hyper } = await createDrives(t, null, { setup: false })

  await local.put('/folder/file.txt', b4a.from('same'))
  await local.put('/folder/subfolder/file.txt', b4a.from('same'))

  const m = new MirrorDrive(local, hyper, { ignore: ['/equal.txt', 'tmp.txt', '/folder/subfolder'] })
  await m.done()

  t.is(await hyper.get('/equal.txt'), null)
  t.is(await hyper.get('/tmp.txt'), null)
  t.is(await hyper.get('/folder/subfolder/file.txt'), null)

  t.not(await hyper.get('/folder/file.txt'), null)
})

test('mirror localdrive into hyperdrive with ignore function', async function (t) {
  const { local } = await createDrives(t)
  const { hyper } = await createDrives(t, null, { setup: false })

  await local.put('/folder/file.txt', b4a.from('same'))
  await local.put('/folder/subfolder/file.txt', b4a.from('same'))
  const filter = ['/equal.txt', 'tmp.txt', '/folder/subfolder']
  const ignore = (key) => {
    return filter.some(e => unixPathResolve('/', e) === key)
  }

  const m = new MirrorDrive(local, hyper, { ignore })
  await m.done()

  t.is(await hyper.get('/equal.txt'), null)
  t.is(await hyper.get('/tmp.txt'), null)
  t.is(await hyper.get('/folder/subfolder/file.txt'), null)

  t.not(await hyper.get('/folder/file.txt'), null)
})
