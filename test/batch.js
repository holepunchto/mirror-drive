const test = require('brittle')
const { createDrives } = require('./helpers/index.js')
const MirrorDrive = require('../index.js')
const b4a = require('b4a')

test('opts.batch false (default)', async function (t) {
  const { local, hyper } = await createDrives(t)

  await local.put('/buffer.txt', b4a.from('edit'))
  await local.put('/tmp.txt', b4a.from('edit'))
  await local.del('/meta.txt')

  t.alike(await hyper.get('/buffer.txt'), b4a.from('same'))
  t.alike(await hyper.get('/tmp.txt'), b4a.from('same'))

  const m = new MirrorDrive(local, hyper)
  let i = 0

  for await (const diff of m) {
    if (i++ !== 2) continue
    t.is(diff.op, 'change')

    const a = (await hyper.get('/buffer.txt')).toString() === 'edit'
    const b = (await hyper.get('/tmp.txt')).toString() === 'edit'
    t.ok(a || b)
  }

  t.alike(await hyper.get('/buffer.txt'), b4a.from('edit'))
  t.alike(await hyper.get('/tmp.txt'), b4a.from('edit'))
})

test('opts.batch basic', async function (t) {
  const { local, hyper } = await createDrives(t)

  await local.put('/buffer.txt', b4a.from('edit'))
  await local.put('/tmp.txt', b4a.from('edit'))
  await local.del('/meta.txt')

  t.alike(await hyper.get('/buffer.txt'), b4a.from('same'))
  t.alike(await hyper.get('/tmp.txt'), b4a.from('same'))

  const m = new MirrorDrive(local, hyper, { batch: true })
  let i = 0

  for await (const diff of m) {
    if (i++ !== 2) continue
    t.is(diff.op, 'change')

    t.alike(await hyper.get('/buffer.txt'), b4a.from('same'))
    t.alike(await hyper.get('/tmp.txt'), b4a.from('same'))
  }

  t.alike(await hyper.get('/buffer.txt'), b4a.from('edit'))
  t.alike(await hyper.get('/tmp.txt'), b4a.from('edit'))
})
