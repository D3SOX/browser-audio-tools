import { useCallback, useEffect, useState } from 'react';
import type { ID3Metadata } from '../api';
import type { Operation } from '../types';

type UseOutputFilenameOptions = {
  operation: Operation;
  metadata: ID3Metadata;
  retagMetadata: ID3Metadata;
  mp3SourceFile: File | null;
  retagFile: File | null;
  wavFile: File | null;
};

export function useOutputFilename({
  operation,
  metadata,
  retagMetadata,
  mp3SourceFile,
  retagFile,
  wavFile,
}: UseOutputFilenameOptions) {
  const [outputFilename, setOutputFilenameState] = useState<string>('');
  const [useAutoFilename, setUseAutoFilename] = useState(false);

  // Helper to generate "Artist - Title" base filename (without extension)
  const getAutoFilename = useCallback((meta: ID3Metadata) => {
    const artist = meta.artist.trim();
    const title = meta.title.trim();
    if (artist && title) {
      // Sanitize filename (remove characters not allowed in filenames)
      const sanitize = (s: string) => s.replace(/[<>:"/\\|?*]/g, '_');
      return `${sanitize(artist)} - ${sanitize(title)}`;
    }
    return '';
  }, []);

  // Helper to get default base filename (without extension) for the current operation
  const getDefaultFilename = useCallback(() => {
    if (operation === 'retag-wav') {
      if (mp3SourceFile) {
        return mp3SourceFile.name.replace(/\.mp3$/i, '');
      }
      if (wavFile) {
        return wavFile.name.replace(/\.wav$/i, '');
      }
    }
    if (operation === 'retag' && retagFile) {
      return retagFile.name.replace(/\.mp3$/i, '') + '_retagged';
    }
    return '';
  }, [operation, mp3SourceFile, retagFile, wavFile]);

  // Update output filename when useAutoFilename changes or when metadata changes (if auto is on)
  useEffect(() => {
    if (operation !== 'retag-wav' && operation !== 'retag') return;

    if (useAutoFilename) {
      const meta = operation === 'retag-wav' ? metadata : retagMetadata;
      const autoName = getAutoFilename(meta);
      if (autoName) {
        setOutputFilenameState(autoName);
      } else {
        // Fall back to default if artist/title are empty
        setOutputFilenameState(getDefaultFilename());
      }
    }
  }, [
    operation,
    useAutoFilename,
    metadata,
    retagMetadata,
    getAutoFilename,
    getDefaultFilename,
  ]);

  // Set default filename when file is selected (only if not using auto-format)
  useEffect(() => {
    if (operation !== 'retag-wav' && operation !== 'retag') return;
    if (useAutoFilename) return; // Let the auto-format effect handle it

    setOutputFilenameState(getDefaultFilename());
  }, [
    operation,
    mp3SourceFile,
    retagFile,
    wavFile,
    useAutoFilename,
    getDefaultFilename,
  ]);

  // Setter that disables auto-format when manually editing
  // Also strips .mp3 extension if user types it (since it's shown as a fixed suffix)
  const setOutputFilename = useCallback((value: string) => {
    const base = value.replace(/\.mp3$/i, '');
    setOutputFilenameState(base);
    // Disable auto-format when user manually edits
    setUseAutoFilename(false);
  }, []);

  // Reset to initial state
  const reset = useCallback(() => {
    setOutputFilenameState('');
    setUseAutoFilename(false);
  }, []);

  return {
    outputFilename,
    setOutputFilename,
    useAutoFilename,
    setUseAutoFilename,
    reset,
  };
}
