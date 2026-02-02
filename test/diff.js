const test = require('brittle')
const { createDrives, toArray } = require('./helpers/index.js')
const MirrorDrive = require('../index.js')
const b4a = require('b4a')

test('remove', async function (t) {
  const { local, hyper } = await createDrives(t)

  await local.del('/tmp.txt')
  t.ok(await hyper.entry('/tmp.txt'))

  const m = new MirrorDrive(local, hyper)

  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })
  t.is(m.bytesRemoved, 0)
  t.is(m.bytesAdded, 0)
  const diffs = await toArray(m)
  t.alike(m.count, { files: 5, add: 0, remove: 1, change: 0 })
  t.is(m.bytesRemoved, 4)
  t.is(m.bytesAdded, 0)

  t.is(diffs.length, 1)
  t.alike(diffs[0], { op: 'remove', key: '/tmp.txt', bytesRemoved: 4, bytesAdded: 0 })

  t.absent(await hyper.entry('/tmp.txt'))
})

test('add', async function (t) {
  const { local, hyper } = await createDrives(t)

  await local.put('/new-tmp.txt', b4a.from('same'))
  t.absent(await hyper.entry('/new-tmp.txt'))

  const m = new MirrorDrive(local, hyper)

  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })
  t.is(m.bytesRemoved, 0)
  t.is(m.bytesAdded, 0)
  const diffs = await toArray(m)
  t.alike(m.count, { files: 7, add: 1, remove: 0, change: 0 })
  t.is(m.bytesRemoved, 0)
  t.is(m.bytesAdded, 4)

  t.is(diffs.length, 1)
  t.alike(diffs[0], { op: 'add', key: '/new-tmp.txt', bytesRemoved: 0, bytesAdded: 4 })

  t.alike(await hyper.get('/new-tmp.txt'), b4a.from('same'))
})

test('change content', async function (t) {
  const { local, hyper } = await createDrives(t)

  await local.put('/buffer.txt', b4a.from('edit'))
  t.alike(await hyper.get('/buffer.txt'), b4a.from('same'))

  const m = new MirrorDrive(local, hyper)

  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })
  t.is(m.bytesRemoved, 0)
  t.is(m.bytesAdded, 0)
  const diffs = await toArray(m)
  t.alike(m.count, { files: 6, add: 0, remove: 0, change: 1 })
  t.is(m.bytesRemoved, 4)
  t.is(m.bytesAdded, 4)

  t.is(diffs.length, 1)
  t.alike(diffs[0], { op: 'change', key: '/buffer.txt', bytesRemoved: 4, bytesAdded: 4 })

  t.alike(await hyper.get('/buffer.txt'), b4a.from('edit'))
})

test('change size', async function (t) {
  const { local, hyper } = await createDrives(t)

  await local.put('/buffer.txt', b4a.from('edit-ed'))
  t.alike(await hyper.get('/buffer.txt'), b4a.from('same'))

  const m = new MirrorDrive(local, hyper)

  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })
  t.is(m.bytesRemoved, 0)
  t.is(m.bytesAdded, 0)
  const diffs = await toArray(m)
  t.alike(m.count, { files: 6, add: 0, remove: 0, change: 1 })
  t.is(m.bytesRemoved, 4)
  t.is(m.bytesAdded, 7)

  t.is(diffs.length, 1)
  t.alike(diffs[0], { op: 'change', key: '/buffer.txt', bytesRemoved: 4, bytesAdded: 7 })

  t.alike(await hyper.get('/buffer.txt'), b4a.from('edit-ed'))
})

test('change metadata', async function (t) {
  const { local, hyper } = await createDrives(t)

  await local.put('/meta.txt', b4a.from('same'), { metadata: 'edit' })
  t.alike((await hyper.entry('/meta.txt')).value.metadata, 'same')

  const m = new MirrorDrive(local, hyper)

  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })
  t.is(m.bytesRemoved, 0)
  t.is(m.bytesAdded, 0)
  const diffs = await toArray(m)
  t.alike(m.count, { files: 6, add: 0, remove: 0, change: 1 })
  t.is(m.bytesRemoved, 0)
  t.is(m.bytesAdded, 0)

  t.is(diffs.length, 1)
  t.alike(diffs[0], { op: 'change', key: '/meta.txt', bytesRemoved: 0, bytesAdded: 0 })

  t.alike((await hyper.entry('/meta.txt')).value.metadata, 'edit')
})
