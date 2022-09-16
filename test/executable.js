const test = require('brittle')
const { createDrives, toArray, isWin } = require('./helpers/index.js')
const MirrorDrive = require('../index.js')

test('executable basic', { skip: isWin }, async function (t) {
  const { local, hyper } = await createDrives(t, undefined)

  await local.put('/script.sh', Buffer.from('# bash'), { executable: true })
  t.absent(await hyper.entry('/script.sh'))

  const m = new MirrorDrive(local, hyper)

  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })
  const diffs = await toArray(m)
  t.alike(m.count, { files: 7, add: 1, remove: 0, change: 0 })

  t.is(diffs.length, 1)
  t.alike(diffs[0], { op: 'add', key: '/script.sh', bytesRemoved: 0, bytesAdded: 6 })

  t.alike((await hyper.entry('/script.sh')).value.executable, true)
})

test('executable change', { skip: isWin }, async function (t) {
  const { local, hyper } = await createDrives(t, undefined)

  await local.put('/script.sh', Buffer.from('# bash'), { executable: false })
  await hyper.put('/script.sh', Buffer.from('# bash'), { executable: true })

  const m = new MirrorDrive(local, hyper)

  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })
  const diffs = await toArray(m)
  t.alike(m.count, { files: 7, add: 0, remove: 0, change: 1 })

  t.is(diffs.length, 1)
  t.alike(diffs[0], { op: 'change', key: '/script.sh', bytesRemoved: 6, bytesAdded: 6 })

  t.alike((await hyper.entry('/script.sh')).value.executable, false)
})

test('executable same', { skip: isWin }, async function (t) {
  const { local, hyper } = await createDrives(t, undefined)

  await local.put('/script.sh', Buffer.from('# bash'), { executable: true })
  await hyper.put('/script.sh', Buffer.from('# bash'), { executable: true })

  const m = new MirrorDrive(local, hyper)

  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })
  const diffs = await toArray(m)
  t.alike(m.count, { files: 7, add: 0, remove: 0, change: 0 })

  t.is(diffs.length, 0)
})
