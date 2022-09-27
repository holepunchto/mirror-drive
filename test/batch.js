const test = require('brittle')
const { createDrives } = require('./helpers/index.js')
const MirrorDrive = require('../index.js')

test('opts.batch false (default)', async function (t) {
  const { local, hyper } = await createDrives(t)

  await local.put('/buffer.txt', Buffer.from('edit'))
  await local.put('/tmp.txt', Buffer.from('edit'))

  t.alike(await hyper.get('/buffer.txt'), Buffer.from('same'))
  t.alike(await hyper.get('/tmp.txt'), Buffer.from('same'))

  const m = new MirrorDrive(local, hyper)
  let i = 0

  for await (const diff of m) {
    if (i++ !== 1) continue
    t.is(diff.op, 'change')

    const a = (await hyper.get('/buffer.txt')).toString() === 'edit'
    const b = (await hyper.get('/tmp.txt')).toString() === 'edit'
    t.ok(a || b)
  }

  t.alike(await hyper.get('/buffer.txt'), Buffer.from('edit'))
  t.alike(await hyper.get('/tmp.txt'), Buffer.from('edit'))
})

test('opts.batch basic', async function (t) {
  const { local, hyper } = await createDrives(t)

  await local.put('/buffer.txt', Buffer.from('edit'))
  await local.put('/tmp.txt', Buffer.from('edit'))

  t.alike(await hyper.get('/buffer.txt'), Buffer.from('same'))
  t.alike(await hyper.get('/tmp.txt'), Buffer.from('same'))

  const m = new MirrorDrive(local, hyper, { batch: true })
  let i = 0

  for await (const diff of m) {
    if (i++ !== 1) continue
    t.is(diff.op, 'change')

    t.alike(await hyper.get('/buffer.txt'), Buffer.from('same'))
    t.alike(await hyper.get('/tmp.txt'), Buffer.from('same'))
  }

  t.alike(await hyper.get('/buffer.txt'), Buffer.from('edit'))
  t.alike(await hyper.get('/tmp.txt'), Buffer.from('edit'))
})
