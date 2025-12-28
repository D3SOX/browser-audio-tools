export type Operation =
  | 'noise'
  | 'cover'
  | 'retag-wav'
  | 'convert'
  | 'retag'
  | 'trim'
  | 'visualize';

export type Theme = 'light' | 'dark' | 'system';

export type MetadataField =
  | 'title'
  | 'artist'
  | 'album'
  | 'year'
  | 'track'
  | 'genre'
  | 'cover';

export const FIELD_LABELS: Record<MetadataField, string> = {
  title: 'Title',
  artist: 'Artist',
  album: 'Album',
  year: 'Year',
  track: 'Track #',
  genre: 'Genre',
  cover: 'Cover Art',
};

export const BITRATE_OPTIONS = ['96k', '128k', '192k', '256k', '320k'] as const;
export type Bitrate = (typeof BITRATE_OPTIONS)[number];
