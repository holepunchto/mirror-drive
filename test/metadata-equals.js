const test = require('brittle')
const { createDrives, toArray } = require('./helpers/index.js')
const MirrorDrive = require('../index.js')

test('options metadataEquals - equal', async function (t) {
  t.plan(5)

  const { local, hyper } = await createDrives(t, undefined, { setup: false })

  await local.put('/tmp.txt', Buffer.from('same'), { metadata: 'same' })
  await hyper.put('/tmp.txt', Buffer.from('same'), { metadata: 'same' })

  const m = new MirrorDrive(local, hyper, { metadataEquals })

  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })
  const diffs = await toArray(m)
  t.alike(m.count, { files: 1, add: 0, remove: 0, change: 0 })

  t.is(diffs.length, 0)

  function metadataEquals (srcMetadata, dstMetadata) {
    t.ok(srcMetadata === 'same')
    t.ok(dstMetadata === 'same')
    return srcMetadata === dstMetadata
  }
})

test('options metadataEquals - change', async function (t) {
  t.plan(6)

  const { local, hyper } = await createDrives(t, undefined, { setup: false })

  await local.put('/tmp.txt', Buffer.from('same'), { metadata: 'same' })
  await hyper.put('/tmp.txt', Buffer.from('same'), { metadata: 'edit' })

  const m = new MirrorDrive(local, hyper, { metadataEquals })

  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })
  const diffs = await toArray(m)
  t.alike(m.count, { files: 1, add: 0, remove: 0, change: 1 })

  t.is(diffs.length, 1)
  t.alike(diffs[0], { op: 'change', key: '/tmp.txt', bytesRemoved: 4, bytesAdded: 4 })

  function metadataEquals (srcMetadata, dstMetadata) {
    t.ok(srcMetadata === 'same')
    t.ok(dstMetadata === 'edit')
    return srcMetadata === dstMetadata
  }
})

test('options metadataEquals - remove metadata', async function (t) {
  t.plan(6)

  const { local, hyper } = await createDrives(t, undefined, { setup: false })

  await local.put('/tmp.txt', Buffer.from('same'))
  await hyper.put('/tmp.txt', Buffer.from('same'), { metadata: 'same' })

  const m = new MirrorDrive(local, hyper, { metadataEquals })

  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })
  const diffs = await toArray(m)
  t.alike(m.count, { files: 1, add: 0, remove: 0, change: 1 })

  t.is(diffs.length, 1)
  t.alike(diffs[0], { op: 'change', key: '/tmp.txt', bytesRemoved: 4, bytesAdded: 4 })

  function metadataEquals (srcMetadata, dstMetadata) {
    t.ok(srcMetadata === null)
    t.ok(dstMetadata === 'same')
    return srcMetadata === dstMetadata
  }
})

test('options metadataEquals - new metadata', async function (t) {
  t.plan(6)

  const { local, hyper } = await createDrives(t, undefined, { setup: false })

  await local.put('/tmp.txt', Buffer.from('same'), { metadata: 'same' })
  await hyper.put('/tmp.txt', Buffer.from('same'))

  const m = new MirrorDrive(local, hyper, { metadataEquals })

  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })
  const diffs = await toArray(m)
  t.alike(m.count, { files: 1, add: 0, remove: 0, change: 1 })

  t.is(diffs.length, 1)
  t.alike(diffs[0], { op: 'change', key: '/tmp.txt', bytesRemoved: 4, bytesAdded: 4 })

  function metadataEquals (srcMetadata, dstMetadata) {
    t.ok(srcMetadata === 'same')
    t.ok(dstMetadata === null)
    return srcMetadata === dstMetadata
  }
})

test('options metadataEquals - new entry', async function (t) {
  t.plan(5)

  const { local, hyper } = await createDrives(t, undefined, { setup: false })

  await local.put('/tmp.txt', Buffer.from('same'), { metadata: 'same' })
  t.absent(await hyper.entry('/tmp.txt'))

  const m = new MirrorDrive(local, hyper, { metadataEquals })

  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })
  const diffs = await toArray(m)
  t.alike(m.count, { files: 1, add: 1, remove: 0, change: 0 })

  t.is(diffs.length, 1)
  t.alike(diffs[0], { op: 'add', key: '/tmp.txt', bytesRemoved: 0, bytesAdded: 4 })

  function metadataEquals (srcMetadata, dstMetadata) {
    t.fail('should not have metadata check')
    return false
  }
})
