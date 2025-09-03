const test = require('brittle')
const FramedStream = require('framed-stream')
const { PassThrough, Transform } = require('stream')
const { createDrives, toArray } = require('./helpers/index.js')
const MirrorDrive = require('../index.js')
const b4a = require('b4a')

function upperFramedTransform () {
  // A transform that uses framed-stream internally to get full-message boundaries
  // Then uppercases each decoded message and pushes it downstream.
  const raw = new PassThrough()
  const framed = new FramedStream(raw)

  const t = new Transform({
    transform (chunk, _enc, cb) {
      framed.write(chunk)
      cb(null)
    },
    final (cb) {
      framed.end()
      framed.once('close', () => cb(null))
    }
  })

  framed.on('data', (msg) => {
    t.push(b4a.from(String(msg).toUpperCase()))
  })

  // Avoid unhandled errors from framed/raw teardown
  framed.on('error', () => {})
  raw.on('error', () => {})

  return t
}

test('transforms: uppercase .txt files and stay equal on second run', async function (t) {
  const { local: src } = await createDrives(t)
  const { local: dst } = await createDrives(t, { setup: false })

  // Add extra file to ensure variety
  await src.put('/notes.txt', b4a.from('hello world'))

  const transforms = [
    { test: /\.txt$/, transform: () => upperFramedTransform() }
  ]

  const m1 = new MirrorDrive(src, dst, { transforms })
  await m1.done()

  const upperEqual = await dst.get('/equal.txt')
  t.alike(String(upperEqual), 'SAME')

  const upperNotes = await dst.get('/notes.txt')
  t.alike(String(upperNotes), 'HELLO WORLD')

  // Second run should produce only equals
  const m2 = new MirrorDrive(src, dst, { transforms, includeEquals: true })
  const diffs = await toArray(m2)

  t.ok(diffs.length > 0, 'emitted some diffs')
  for (const d of diffs) t.is(d.op, 'equal')
})

function errorTransform () {
  let done = false
  return new Transform({
    transform (chunk, _enc, cb) {
      if (!done) {
        done = true
        cb(new Error('transform boom'))
      } else cb(null, chunk)
    }
  })
}

test('transforms: errors propagate and abort mirror', async function (t) {
  const { local: src } = await createDrives(t)
  const { local: dst } = await createDrives(t, { setup: false })

  await src.put('/notes.txt', b4a.from('hello'))

  const transforms = [
    { test: /\/notes\.txt$/, transform: () => errorTransform() }
  ]

  const m = new MirrorDrive(src, dst, { transforms })

  try {
    await m.done()
    t.fail('should have thrown from transform')
  } catch (err) {
    t.is(err.message, 'transform boom')
  }
})
