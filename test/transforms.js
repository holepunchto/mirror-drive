const test = require('brittle')
const { Transform } = require('streamx')
const { createDrives, toArray } = require('./helpers/index.js')
const MirrorDrive = require('../index.js')
const b4a = require('b4a')

function upperTransform () {
  return new Transform({
    transform (chunk, cb) {
      this.push(b4a.from(String(chunk).toUpperCase()))
      cb(null)
    }
  })
}

test('transforms: uppercase .txt files and stay equal on second run', async function (t) {
  const { local: src } = await createDrives(t)
  const { local: dst } = await createDrives(t, { setup: false })

  // Add extra file to ensure variety
  await src.put('/notes.txt', b4a.from('hello world'))

  const transformers = [(key) => upperTransform()]

  const m1 = new MirrorDrive(src, dst, { transformers })
  await m1.done()

  const upperEqual = await dst.get('/equal.txt')
  t.alike(String(upperEqual), 'SAME')

  const upperNotes = await dst.get('/notes.txt')
  t.alike(String(upperNotes), 'HELLO WORLD')

  // Second run should produce only equals
  const m2 = new MirrorDrive(src, dst, { transformers: [(key) => upperTransform()], includeEquals: true })
  const diffs = await toArray(m2)

  t.ok(diffs.length > 0, 'emitted some diffs')
  for (const d of diffs) t.is(d.op, 'equal')
})

function errorTransform () {
  let done = false
  return new Transform({
    transform (chunk, cb) {
      if (!done) {
        done = true
        cb(new Error('transform boom'))
      } else {
        this.push(chunk)
        cb(null)
      }
    }
  })
}

test('transforms: errors propagate and abort mirror', async function (t) {
  const { local: src } = await createDrives(t)
  const { local: dst } = await createDrives(t, { setup: false })

  await src.put('/notes.txt', b4a.from('hello'))

  const transformers = [(key) => errorTransform()]

  const m = new MirrorDrive(src, dst, { transformers })

  try {
    await m.done()
    t.fail('should have thrown from transform')
  } catch (err) {
    t.is(err.message, 'transform boom')
  }
})

test('transformers: passthrough (null) leaves bytes unchanged', async function (t) {
  const { local: src } = await createDrives(t)
  const { local: dst } = await createDrives(t, { setup: false })

  const passthrough = (key) => null

  const m1 = new MirrorDrive(src, dst, { transformers: [passthrough] })
  await m1.done()

  const m2 = new MirrorDrive(src, dst, { transformers: [passthrough], includeEquals: true })
  const diffs = await toArray(m2)

  t.ok(diffs.length > 0, 'emitted some diffs')
  for (const d of diffs) t.is(d.op, 'equal')
})

test('transformers: length-changing transform equals on rerun', async function (t) {
  const { local: src } = await createDrives(t)
  const { local: dst } = await createDrives(t, { setup: false })

  // Increase length by appending fruit to every chunk
  function fruitSaladTransform () {
    return new Transform({
      transform (chunk, cb) {
        this.push(b4a.concat([chunk, b4a.from('🍐')]))
        cb(null)
      }
    })
  }

  const transformers = [(key) => fruitSaladTransform()]

  const m1 = new MirrorDrive(src, dst, { transformers })
  await m1.done()

  const m2 = new MirrorDrive(src, dst, { transformers, includeEquals: true })
  const diffs = await toArray(m2)

  t.ok(diffs.length > 0, 'emitted some diffs')
  for (const d of diffs) t.is(d.op, 'equal')
})
