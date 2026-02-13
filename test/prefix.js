const test = require('brittle')
const { createDrives, changeDrive, toArray, sortObjects } = require('./helpers/index.js')
const MirrorDrive = require('../index.js')
const b4a = require('b4a')

test('prefix basic', async function (t) {
  const { local, hyper } = await createDrives(t)

  await changeDrive(local)

  await local.put('/examples/a.txt', b4a.from('same'))
  await local.put('/examples/b.txt', b4a.from('same'))

  await hyper.put('/examples/a.txt', b4a.from('same'))
  t.absent(await hyper.entry('/examples/b.txt'))

  const m = new MirrorDrive(local, hyper, { prefix: '/examples' })
  const diffs = await toArray(m)
  t.is(diffs.length, 1)
  t.alike(diffs[0], { op: 'add', key: '/examples/b.txt', bytesRemoved: 0, bytesAdded: 4 })

  t.ok(await hyper.entry('/examples/b.txt'))
})

test('prefix { from, to } to rebase paths', async function (t) {
  const { local, hyper } = await createDrives(t)

  await local.put('/foo/bar/baz/a', Buffer.from('a1'))
  await local.put('/foo/bar/baz/b', Buffer.from('b1'))
  await local.put('/foo/bar/qux/x', Buffer.from('x1'))

  await hyper.put('/baz/a', Buffer.from('a0')) // change
  await hyper.put('/baz/extra', Buffer.from('zzz')) // remove (prune)
  await hyper.put('/baz-old/z', Buffer.from('keep')) // untouched

  const actual = []

  const m = new MirrorDrive(local, hyper, {
    includeEquals: true,
    prefix: { from: '/foo/bar/baz', to: '/baz' }
  })

  for await (const diff of m) {
    delete diff.count
    actual.push(diff)
  }

  t.alike(
    sortObjects(actual),
    sortObjects([
      { op: 'change', key: '/baz/a', bytesRemoved: 2, bytesAdded: 2 },
      { op: 'add', key: '/baz/b', bytesRemoved: 0, bytesAdded: 2 },
      { op: 'remove', key: '/baz/extra', bytesRemoved: 3, bytesAdded: 0 }
    ])
  )

  t.is((await hyper.get('/baz/a')).toString(), 'a1')
  t.is((await hyper.get('/baz/b')).toString(), 'b1')
  t.absent(await hyper.get('/baz/extra'))
  t.is((await hyper.get('/baz-old/z')).toString(), 'keep')

  const m2 = new MirrorDrive(local, hyper, {
    prefix: { from: '/foo/bar/baz', to: '/baz' }
  })
  const diffs = await toArray(m2)
  t.is(diffs.length, 0)
})
