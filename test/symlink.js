const test = require('brittle')
const { createDrives, toArray } = require('./helpers/index.js')
const mirror = require('../index.js')

test('symlink basic', async function (t) {
  const { local, hyper } = await createDrives(t, undefined)

  await local.symlink('/tmp.shortcut', '/tmp.txt')
  t.absent(await hyper.entry('/tmp.shortcut'))

  const m = mirror(local, hyper)

  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })
  const diffs = await toArray(m)
  t.alike(m.count, { files: 7, add: 1, remove: 0, change: 0 })

  t.is(diffs.length, 1)
  t.alike(diffs[0], { op: 'add', key: '/tmp.shortcut', bytesRemoved: 0, bytesAdded: 0 })

  t.alike(await hyper.entry('/tmp.shortcut'), {
    seq: 7,
    key: '/tmp.shortcut',
    value: {
      executable: false,
      linkname: '/tmp.txt',
      blob: null,
      metadata: null
    }
  })
})

test('symlink prune', async function (t) {
  const { local, hyper } = await createDrives(t, undefined)

  t.absent(await local.entry('/tmp.shortcut'))
  await hyper.symlink('/tmp.shortcut', '/tmp.txt')

  const m = mirror(local, hyper)

  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })
  const diffs = await toArray(m)
  t.alike(m.count, { files: 6, add: 0, remove: 1, change: 0 })

  t.is(diffs.length, 1)
  t.alike(diffs[0], { op: 'remove', key: '/tmp.shortcut', bytesRemoved: 0, bytesAdded: 0 })

  t.absent(await local.entry('/tmp.shortcut'))
  t.absent(await hyper.entry('/tmp.shortcut'))
})

test('symlink same', async function (t) {
  const { local, hyper } = await createDrives(t, undefined)

  await local.symlink('/tmp.shortcut', '/tmp.txt')
  await hyper.symlink('/tmp.shortcut', '/tmp.txt')

  const m = mirror(local, hyper)

  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })
  const diffs = await toArray(m)
  t.alike(m.count, { files: 7, add: 0, remove: 0, change: 0 })

  t.is(diffs.length, 0)

  t.ok(await local.entry('/tmp.shortcut'))
  t.ok(await hyper.entry('/tmp.shortcut'))
})