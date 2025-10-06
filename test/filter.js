const test = require('brittle')
const { createDrives, changeDrive, toArray } = require('./helpers/index.js')
const MirrorDrive = require('../index.js')
const b4a = require('b4a')

test('basic filter - local to hyper', async function (t) {
  const { local, hyper } = await createDrives(t)

  await changeDrive(local)
  await addFolders(local)
  await addFolders(hyper)

  const m = new MirrorDrive(local, hyper, {
    filter: (key) => key === '/tmp.txt' || key === '/buffer.txt'
  })
  const diffs = await toArray(m)
  t.is(diffs.length, 2)
  t.alike(diffs[0], {
    op: 'remove',
    key: '/tmp.txt',
    bytesRemoved: 4,
    bytesAdded: 0
  })
  t.alike(diffs[1], {
    op: 'change',
    key: '/buffer.txt',
    bytesRemoved: 4,
    bytesAdded: 4
  })
})

test('basic filter - hyper to local', async function (t) {
  const { local, hyper } = await createDrives(t)

  await changeDrive(hyper)
  await addFolders(local)
  await addFolders(hyper)

  const m = new MirrorDrive(hyper, local, {
    filter: (key) => key === '/tmp.txt' || key === '/buffer.txt'
  })
  const diffs = await toArray(m)
  t.is(diffs.length, 2)
  t.alike(diffs[0], {
    op: 'remove',
    key: '/tmp.txt',
    bytesRemoved: 4,
    bytesAdded: 0
  })
  t.alike(diffs[1], {
    op: 'change',
    key: '/buffer.txt',
    bytesRemoved: 4,
    bytesAdded: 4
  })
})

test('filter - local to hyper', async function (t) {
  const { local, hyper } = await createDrives(t)

  await addFolders(local)
  await addFolders(hyper)

  const actual = []
  const expected = [
    '/examples/a.txt',
    '/examples/b.txt',
    '/examples/sub/a.txt',
    '/examples/sub/b.txt',
    '/examples/sub/sub2/sub3/b.txt',
    '/examples/sub/sub2/sub3/a.txt',
    '/equal.txt',
    '/buffer.txt',
    '/equal-meta.txt',
    '/meta.txt',
    '/add-meta.txt',
    '/tmp.txt'
  ]

  const m = new MirrorDrive(local, hyper, { filter: onfilter })
  const diffs = await toArray(m)
  t.is(diffs.length, 0)

  t.alike(actual.sort(), expected.sort())

  function onfilter(key) {
    actual.push(key)
    return true
  }
})

test('filter - hyper to local', async function (t) {
  const { local, hyper } = await createDrives(t)

  await addFolders(local)
  await addFolders(hyper)

  const actual = []
  const expected = [
    '/examples/a.txt',
    '/examples/b.txt',
    '/examples/sub/a.txt',
    '/examples/sub/b.txt',
    '/examples/sub/sub2/sub3/b.txt',
    '/examples/sub/sub2/sub3/a.txt',
    '/equal.txt',
    '/buffer.txt',
    '/equal-meta.txt',
    '/meta.txt',
    '/add-meta.txt',
    '/tmp.txt'
  ]

  const m = new MirrorDrive(hyper, local, { filter: onfilter })
  const diffs = await toArray(m)
  t.is(diffs.length, 0)

  t.alike(actual.sort(), expected.sort())

  function onfilter(key) {
    actual.push(key)
    return true
  }
})

async function addFolders(drive) {
  await drive.put('/examples/a.txt', b4a.from('same'))
  await drive.put('/examples/b.txt', b4a.from('same'))

  await drive.put('/examples/sub/a.txt', b4a.from('same'))
  await drive.put('/examples/sub/b.txt', b4a.from('same'))

  await drive.put('/examples/sub/sub2/sub3/a.txt', b4a.from('same'))
  await drive.put('/examples/sub/sub2/sub3/b.txt', b4a.from('same'))
}
