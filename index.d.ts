// Type declarations for the holepunchto/mirror-drive public API.

import type Hyperdrive from 'hyperdrive'
import type Localdrive from 'localdrive'

/**
 * Options for controlling how `MirrorDrive` synchronises drives.
 */
export interface MirrorDriveOptions {
  /** One or more path prefixes to mirror. When an array, each prefix is mirrored in order. */
  prefix?: string | Array<string>
  /** Walk the diff and emit events without writing any changes to `dst`. */
  dryRun?: boolean
  /** Remove files from `dst` that no longer exist in `src`. */
  prune?: boolean
  /** Emit `{ op: 'equal' }` events for files that are identical in both drives. */
  includeEquals?: boolean
  /** Called with each source key; return `false` to skip that entry. */
  filter?: (arg0: string) => boolean
  /** Custom equality check for file metadata; receives `(srcMetadata, dstMetadata)`. */
  metadataEquals?: (arg0: any, arg1: any) => boolean
  /** Accumulate destination writes in a single batch and flush at the end. */
  batch?: boolean
  /** Pre-computed list of source entries to mirror; when provided, `prefix` is ignored. */
  entries?: Array<object> | null
  /** Paths to exclude from the source listing. */
  ignore?: string | Array<string>
  /** Array of factory functions `(key) => stream | null`; each returned stream is piped between source read and destination write. */
  transformers?: Array<Function>
  /** Enable download/upload progress tracking (requires `src.getBlobs`). */
  progress?: boolean
  /** Enable content-addressed deduplication using Rabin chunking on the destination. */
  dedup?: boolean
}

/**
 * Options for the `monitor()` method.
 */
export interface MonitorOptions {
  /** How often (in milliseconds) the monitor emits `update` events with fresh stats. */
  interval?: number
}

export class MirrorDrive {
  /**
   * Creates a mirror instance to efficiently move `src` drive into `dst` drive.
   * @param src - Source drive to read from.
   * @param dst - Destination drive to write into (must be writable).
   * @param opts - Mirror options.
   */
  constructor(src: Hyperdrive | Localdrive, dst: Hyperdrive | Localdrive, opts?: MirrorDriveOptions)

  /**
   * Live replication peers attached to the source drive's underlying Hypercore.
Returns an empty array when the source is a local drive.
   */
  readonly peers: Array<object>

  /**
   * Download progress as a fraction between `0` and `1`. Returns `1` when the
mirror has finished. Requires `opts.progress` to be enabled; otherwise
always returns `0` until finished.
   */
  readonly downloadProgress: number

  /**
   * Create a live `Monitor` that polls the mirror's progress statistics at a
regular interval and emits `update` events with the latest counts/speeds.
Automatically enables progress tracking on the mirror.
   * @param opts - Monitor options.
   * @returns A new monitor instance attached to this mirror.
   */
  monitor(opts: MonitorOptions): Monitor

  /**
   * It starts processing all the diffing until is done.
   * @returns Resolves when all diffs have been processed.
   */
  done(): Promise<void>

  src: any

  dst: any

  prefix: any

  dedup: any

  dryRun: any

  prune: any

  preload: any

  /**
   * `true` once all blobs for the source entries have been prefetched and are ready for streaming.
   */
  preloaded: boolean

  includeProgress: any

  includeEquals: any

  filter: any

  metadataEquals: any

  batch: any

  entries: any

  transformers: any

  /**
   * It counts the total files proccessed, added, removed, and changed.
   */
  count: { files: number; add: number; remove: number; change: number }

  /**
   * Total bytes removed from the destination so far.
   */
  bytesRemoved: number

  /**
   * Total bytes written to the destination so far.
   */
  bytesAdded: number

  ignore: any

  /**
   * `true` after the mirror iterator has been fully consumed.
   */
  finished: boolean

  /**
   * Number of source blob blocks downloaded from peers so far (progress tracking).
   */
  downloadedBlocks: number

  downloadedBlocksEstimate: any

  /**
   * Total bytes downloaded from peers so far (progress tracking).
   */
  downloadedBytes: number

  downloadSpeed: any

  /**
   * Number of destination blob blocks uploaded to peers so far (progress tracking).
   */
  uploadedBlocks: number

  /**
   * Total bytes uploaded to peers so far (progress tracking).
   */
  uploadedBytes: number

  uploadSpeed: any

  monitors: any

  iterator: any
}

declare class Monitor {
  constructor(mirror: any, options?: any)

  readonly preloaded: any

  readonly destroyed: any

  update(): any

  destroy(): any

  emit(event: any, arg1?: any): any

  mirror: any

  interval: any

  stats: any

  index: any

  on(event: 'update', listener: (stats: any) => void): this
  on(event: 'destroy', listener: () => void): this
  on(event: 'preloaded', listener: () => void): this
}

export default MirrorDrive
