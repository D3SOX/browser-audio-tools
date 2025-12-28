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
