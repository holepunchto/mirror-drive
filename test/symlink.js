const test = require('brittle')
const { createDrives, toArray } = require('./helpers/index.js')
const MirrorDrive = require('../index.js')
const b4a = require('b4a')

test('symlink basic', async function (t) {
  const { local, hyper } = await createDrives(t, undefined)

  await local.symlink('/tmp.shortcut', '/tmp.txt')
  t.absent(await hyper.entry('/tmp.shortcut'))

  const m = new MirrorDrive(local, hyper)

  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })
  t.is(m.bytesRemoved, 0)
  t.is(m.bytesAdded, 0)
  const diffs = await toArray(m)
  t.alike(m.count, { files: 7, add: 1, remove: 0, change: 0 })
  t.is(m.bytesRemoved, 0)
  t.is(m.bytesAdded, 0)

  t.is(diffs.length, 1)
  t.alike(diffs[0], {
    op: 'add',
    key: '/tmp.shortcut',
    bytesRemoved: 0,
    bytesAdded: 0
  })

  t.is((await hyper.entry('/tmp.shortcut')).value.linkname, '/tmp.txt')
})

test('symlink not exists but entry does', async function (t) {
  const { local, hyper } = await createDrives(t, undefined)

  await local.symlink('/tmp.shortcut', '/tmp.txt')
  await hyper.put('/tmp.shortcut', b4a.from('same'))

  const m = new MirrorDrive(local, hyper)

  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })
  t.is(m.bytesRemoved, 0)
  t.is(m.bytesAdded, 0)
  const diffs = await toArray(m)
  t.alike(m.count, { files: 7, add: 0, remove: 0, change: 1 })
  t.is(m.bytesRemoved, 4)
  t.is(m.bytesAdded, 0)

  t.is(diffs.length, 1)
  t.alike(diffs[0], {
    op: 'change',
    key: '/tmp.shortcut',
    bytesRemoved: 4,
    bytesAdded: 0
  })

  t.is((await hyper.entry('/tmp.shortcut')).value.linkname, '/tmp.txt')
})

test('symlink change', async function (t) {
  const { local, hyper } = await createDrives(t, undefined)

  await local.symlink('/tmp.shortcut', '/buffer.txt')
  await hyper.symlink('/tmp.shortcut', '/tmp.txt')

  const m = new MirrorDrive(local, hyper)

  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })
  t.is(m.bytesRemoved, 0)
  t.is(m.bytesAdded, 0)
  const diffs = await toArray(m)
  t.alike(m.count, { files: 7, add: 0, remove: 0, change: 1 })
  t.is(m.bytesRemoved, 0)
  t.is(m.bytesAdded, 0)

  t.is(diffs.length, 1)
  t.alike(diffs[0], {
    op: 'change',
    key: '/tmp.shortcut',
    bytesRemoved: 0,
    bytesAdded: 0
  })

  t.is((await hyper.entry('/tmp.shortcut')).value.linkname, '/buffer.txt')
})

test('symlink prune', async function (t) {
  const { local, hyper } = await createDrives(t, undefined)

  t.absent(await local.entry('/tmp.shortcut'))
  await hyper.symlink('/tmp.shortcut', '/tmp.txt')

  const m = new MirrorDrive(local, hyper)

  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })
  t.is(m.bytesRemoved, 0)
  t.is(m.bytesAdded, 0)
  const diffs = await toArray(m)
  t.alike(m.count, { files: 6, add: 0, remove: 1, change: 0 })
  t.is(m.bytesRemoved, 0)
  t.is(m.bytesAdded, 0)

  t.is(diffs.length, 1)
  t.alike(diffs[0], {
    op: 'remove',
    key: '/tmp.shortcut',
    bytesRemoved: 0,
    bytesAdded: 0
  })

  t.absent(await local.entry('/tmp.shortcut'))
  t.absent(await hyper.entry('/tmp.shortcut'))
})

test('symlink same', async function (t) {
  const { local, hyper } = await createDrives(t, undefined)

  await local.symlink('/tmp.shortcut', '/tmp.txt')
  await hyper.symlink('/tmp.shortcut', '/tmp.txt')

  const m = new MirrorDrive(local, hyper)

  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })
  t.is(m.bytesRemoved, 0)
  t.is(m.bytesAdded, 0)
  const diffs = await toArray(m)
  t.alike(m.count, { files: 7, add: 0, remove: 0, change: 0 })
  t.is(m.bytesRemoved, 0)
  t.is(m.bytesAdded, 0)

  t.is(diffs.length, 0)

  t.ok(await local.entry('/tmp.shortcut'))
  t.ok(await hyper.entry('/tmp.shortcut'))
})
