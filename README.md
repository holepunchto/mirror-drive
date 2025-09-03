# mirror-drive

Mirror a Hyperdrive or Localdrive into another one

```
npm i mirror-drive
```

## Usage
```js
import MirrorDrive from 'mirror-drive'

const src = new Localdrive('./src')
const dst = new Hyperdrive(store)

const mirror = new MirrorDrive(src, dst)
console.log(mirror.count) // => { files: 0, add: 0, remove: 0, change: 0 }

for await (const diff of mirror) {
  console.log(diff) /* {
    op: 'add',
    key: '/new-file.txt',
    bytesRemoved: 0,
    bytesAdded: 4
  }*/
}

console.log(mirror.count) // => { files: 1, add: 1, remove: 0, change: 0 }
```

Another example:
```js
const mirror = new MirrorDrive(src, dst)

console.log(mirror.count) // => { files: 0, add: 0, remove: 0, change: 0 }
await mirror.done()
console.log(mirror.count) // => { files: 1, add: 1, remove: 0, change: 0 }
```

## API

#### `const mirror = new MirrorDrive(src, dst, [options])`

Creates a mirror instance to efficiently move `src` drive into `dst` drive.

Available `options`:
```js
{
  prefix: '/',
  dryRun: false,
  prune: true,
  includeEquals: false,
  filter: (key) => true,
  metadataEquals: (srcMetadata, dstMetadata) => { ... }
  batch: false,
  entries: null // Array of key entries (if you use this then prefix is ignored)
  ignore: String || Array // Ignore source files and folders by name.
  transforms: [] // Array of { test, transform } to modify file contents
}
```

#### `mirror.count`

It counts the total files proccessed, added, removed, and changed.

Default value: `{ files: 0, add: 0, remove: 0, change: 0 }`

#### `await mirror.done()`

It starts processing all the diffing until is done.

## Transforms

Apply content transforms per file during mirroring. Each item in `transforms` is:

```js
{ test: RegExp | (key, entry) => boolean, transform: ({ key, entry }) => stream }
```

- `test`: RegExp or function to decide if the transform applies to the file `key`.
- `transform`: Factory that returns a fresh Transform/Duplex stream for that file.
- All matching transforms are applied in array order.
- Equality check uses the transformed source stream vs destination, so re-runs emit `equal` when post-transform bytes are unchanged.

Example using framed-stream to uppercase `.txt` contents:

```js
const { PassThrough, Transform } = require('stream')
const FramedStream = require('framed-stream')

function upperFramedTransform () {
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
    t.push(Buffer.from(String(msg).toUpperCase()))
  })

  return t
}

const mirror = new MirrorDrive(src, dst, {
  transforms: [
    { test: /\.txt$/, transform: () => upperFramedTransform() }
  ]
})
```

## License

Apache-2.0
