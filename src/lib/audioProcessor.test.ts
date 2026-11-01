import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

type ExecHandler = (ff: FakeFFmpeg, args: string[]) => Promise<number>;

const fetchedUrls: string[] = [];
let execHandler: ExecHandler;
let fake: FakeFFmpeg | null = null;

// Stand-in for ffmpeg.wasm with the same buffer-transfer semantics.
class FakeFFmpeg {
  loaded = false;
  files = new Map<string, Uint8Array>();
  execCalls: string[][] = [];
  running = 0;
  maxRunning = 0;

  constructor() {
    fake = this;
  }

  async load() {
    this.loaded = true;
  }

  on() {}
  off() {}

  async writeFile(path: string, data: Uint8Array) {
    // ffmpeg.wasm transfers the buffer to its worker, detaching it.
    this.files.set(path, structuredClone(data, { transfer: [data.buffer] }));
  }

  async readFile(path: string) {
    const data = this.files.get(path);
    if (!data) throw 'ErrnoError: FS error';
    return data;
  }

  async deleteFile(path: string) {
    if (!this.files.delete(path)) throw 'ErrnoError: FS error';
  }

  async exec(args: string[]) {
    this.execCalls.push(args);
    this.running += 1;
    this.maxRunning = Math.max(this.maxRunning, this.running);
    try {
      return await execHandler(this, args);
    } finally {
      this.running -= 1;
    }
  }
}

// Copies the first input to the output, like a successful stream copy.
const copyInputToOutput: ExecHandler = async (ff, args) => {
  await Promise.resolve();
  const input = args[args.indexOf('-i') + 1] ?? '';
  const output = args.at(-1) ?? '';
  const data = ff.files.get(input);
  if (!data) return 1;
  ff.files.set(output, data.slice());
  return 0;
};

mock.module('@ffmpeg/ffmpeg', () => ({ FFmpeg: FakeFFmpeg }));
globalThis.fetch = (async (url: string | URL | Request) => {
  fetchedUrls.push(String(url));
  return new Response('core');
}) as typeof fetch;

const lib = await import('./audioProcessor');

const bytes = (...values: number[]) => new Uint8Array(values);

function ffmpeg(): FakeFFmpeg {
  if (!fake) throw new Error('FFmpeg was not created');
  return fake;
}

beforeEach(() => {
  execHandler = copyInputToOutput;
  if (fake) {
    fake.execCalls = [];
    fake.maxRunning = 0;
  }
});

describe('parseFFMetadata', () => {
  test('reads global tags', () => {
    const metadata = lib.parseFFMetadata(
      ';FFMETADATA1\ntitle=Song\nartist=Band\nalbum=Record\ndate=2024\ntrack=3/10\ngenre=Rock\n',
    );
    expect(metadata).toEqual({
      title: 'Song',
      artist: 'Band',
      album: 'Record',
      year: '2024',
      track: '3/10',
      genre: 'Rock',
    });
  });

  test('removes escape characters', () => {
    const metadata = lib.parseFFMetadata(
      ';FFMETADATA1\ntitle=Hello\\; World \\= \\#1 \\\\ end\nartist=AC\\\\DC\n',
    );
    expect(metadata.title).toBe('Hello; World = #1 \\ end');
    expect(metadata.artist).toBe('AC\\DC');
  });

  test('joins escaped newlines', () => {
    const metadata = lib.parseFFMetadata(
      ';FFMETADATA1\ntitle=Line one\\\nLine two\nartist=Band\n',
    );
    expect(metadata.title).toBe('Line one\nLine two');
    expect(metadata.artist).toBe('Band');
  });

  test('ignores stream and chapter sections', () => {
    const metadata = lib.parseFFMetadata(
      ';FFMETADATA1\ntitle=Podcast\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=1000\ntitle=Chapter 1\n[STREAM]\ntitle=Cover\n',
    );
    expect(metadata.title).toBe('Podcast');
  });
});

describe('FFmpeg jobs', () => {
  afterEach(() => {
    // Every job must clean up after itself.
    expect(ffmpeg().files.size).toBe(0);
  });

  test('loads the single-threaded core without a worker file', async () => {
    await lib.readMetadata(bytes(1), 'song.mp3').catch(() => {});
    expect(fetchedUrls).toHaveLength(2);
    expect(fetchedUrls.every((url) => url.includes('/@ffmpeg/core@'))).toBe(
      true,
    );
    expect(fetchedUrls.some((url) => url.endsWith('.worker.js'))).toBe(false);
  });

  test('rejects when FFmpeg exits with an error', async () => {
    execHandler = async () => 1;
    await expect(
      lib.convertAudio(bytes(1, 2), 'song.mp3', {
        format: 'wav',
        bitrate: null,
        sampleRate: null,
        channels: 'auto',
      }),
    ).rejects.toThrow('FFmpeg failed with exit code 1');
  });

  test('keeps internal paths apart from the download name', async () => {
    const result = await lib.convertAudio(bytes(1, 2), 'input.wav', {
      format: 'wav',
      bitrate: null,
      sampleRate: null,
      channels: 'auto',
    });
    const args = ffmpeg().execCalls[0] ?? [];
    expect(args[args.indexOf('-i') + 1]).not.toBe(args.at(-1));
    expect(result.filename).toBe('input.wav');
  });

  test('uses the requested filename only for the download', async () => {
    const result = await lib.retagMp3(
      bytes(1),
      { title: 'T', artist: 'A', album: '' },
      'my/odd:name.mp3',
    );
    expect(result.filename).toBe('my/odd:name.mp3');
    expect(ffmpeg().execCalls[0]).not.toContain('my/odd:name.mp3');
  });

  test('runs one job at a time', async () => {
    const jobs = [1, 2, 3].map((n) =>
      lib.trimAudio(bytes(n), `song${n}.mp3`, {
        startTime: 0,
        endTime: 1,
        format: 'source',
        bitrate: '192k',
        removeSilence: false,
        silenceThreshold: -50,
        silenceDuration: 0.5,
      }),
    );
    const results = await Promise.all(jobs);
    expect(ffmpeg().maxRunning).toBe(1);
    expect(results.map((r) => [...r.data])).toEqual([[1], [2], [3]]);
  });

  test('keeps running after a failed job', async () => {
    execHandler = async () => 1;
    const failing = lib.extractCover(bytes(1));
    await expect(failing).rejects.toThrow('No embedded cover art found');
    execHandler = copyInputToOutput;
    await expect(lib.readMetadata(bytes(1), 'a.mp3')).resolves.toBeDefined();
  });

  test('keeps a reused cover buffer intact', async () => {
    const cover = bytes(0xff, 0xd8, 0xff, 0xe0);
    const metadata = { title: 'T', artist: 'A', album: 'B' };
    await lib.retagMp3(bytes(1), metadata, 'a.mp3', undefined, cover);
    await lib.retagMp3(bytes(1), metadata, 'b.mp3', undefined, cover);
    expect([...cover]).toEqual([0xff, 0xd8, 0xff, 0xe0]);
  });

  test('retag keeps source tags and clears emptied fields', async () => {
    await lib.retagMp3(bytes(1), {
      title: 'New',
      artist: '',
      album: 'Album',
      year: '',
      track: '1',
      genre: '',
    });
    const args = ffmpeg().execCalls[0] ?? [];
    expect(args.join(' ')).toContain('-map_metadata 0');
    expect(args).toContain('title=New');
    expect(args).toContain('artist=');
    expect(args).toContain('date=');
  });

  test('retag WAV copies the source cover without re-encoding', async () => {
    await lib.convertWavToMp3WithMetadata(bytes(1), bytes(2), {});
    const args = (ffmpeg().execCalls[0] ?? []).join(' ');
    expect(args).toContain('-map 1:v? -c:v copy');
  });

  test('trim limits the input before filters run', async () => {
    await lib.trimAudio(bytes(1), 'song.mp3', {
      startTime: 2,
      endTime: 5,
      format: 'mp3',
      bitrate: '192k',
      removeSilence: true,
      silenceThreshold: -50,
      silenceDuration: 0.5,
    });
    const args = ffmpeg().execCalls[0] ?? [];
    expect(args.slice(0, 5)).toEqual(['-ss', '2', '-t', '3', '-i']);
    expect(args.indexOf('-af')).toBeGreaterThan(args.indexOf('-i'));
  });

  test('trim keeps unknown formats as a stream copy', async () => {
    const result = await lib.trimAudio(bytes(1), 'voice.opus', {
      startTime: 0,
      endTime: 1,
      format: 'source',
      bitrate: '192k',
      removeSilence: false,
      silenceThreshold: -50,
      silenceDuration: 0.5,
    });
    expect(result.filename).toBe('voice_trimmed.opus');
    expect(ffmpeg().execCalls[0]?.join(' ')).toContain('-c copy');
  });

  test('extracted PNG covers get a PNG name and type', async () => {
    execHandler = async (ff, args) => {
      ff.files.set(args.at(-1) ?? '', bytes(0x89, 0x50, 0x4e, 0x47));
      return 0;
    };
    const result = await lib.extractCover(bytes(1));
    expect(result.mime).toBe('image/png');
    expect(result.filename).toBe('cover.png');
  });
});
