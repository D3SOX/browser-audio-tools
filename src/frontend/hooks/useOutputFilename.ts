import { useCallback, useEffect, useState } from "react";
import type { ID3Metadata } from "../api";
import type { Operation } from "../types";

type UseOutputFilenameOptions = {
  operation: Operation;
  metadata: ID3Metadata;
  retagMetadata: ID3Metadata;
  mp3SourceFile: File | null;
  retagFile: File | null;
};

export function useOutputFilename({
  operation,
  metadata,
  retagMetadata,
  mp3SourceFile,
  retagFile,
}: UseOutputFilenameOptions) {
  const [outputFilename, setOutputFilenameState] = useState<string>("");
  const [useAutoFilename, setUseAutoFilename] = useState(false);

  // Helper to generate "Artist - Title.mp3" filename
  const getAutoFilename = useCallback((meta: ID3Metadata) => {
    const artist = meta.artist.trim();
    const title = meta.title.trim();
    if (artist && title) {
      // Sanitize filename (remove characters not allowed in filenames)
      const sanitize = (s: string) => s.replace(/[<>:"/\\|?*]/g, "_");
      return `${sanitize(artist)} - ${sanitize(title)}.mp3`;
    }
    return "";
  }, []);

  // Helper to get default filename for the current operation
  const getDefaultFilename = useCallback(() => {
    if (operation === "retag-wav" && mp3SourceFile) {
      return mp3SourceFile.name.replace(/\.mp3$/i, "") + ".mp3";
    }
    if (operation === "retag" && retagFile) {
      return retagFile.name.replace(/\.mp3$/i, "") + "_retagged.mp3";
    }
    return "";
  }, [operation, mp3SourceFile, retagFile]);

  // Update output filename when useAutoFilename changes or when metadata changes (if auto is on)
  useEffect(() => {
    if (operation !== "retag-wav" && operation !== "retag") return;

    if (useAutoFilename) {
      const meta = operation === "retag-wav" ? metadata : retagMetadata;
      const autoName = getAutoFilename(meta);
      if (autoName) {
        setOutputFilenameState(autoName);
      } else {
        // Fall back to default if artist/title are empty
        setOutputFilenameState(getDefaultFilename());
      }
    }
  }, [operation, useAutoFilename, metadata, retagMetadata, getAutoFilename, getDefaultFilename]);

  // Set default filename when file is selected (only if not using auto-format)
  useEffect(() => {
    if (operation !== "retag-wav" && operation !== "retag") return;
    if (useAutoFilename) return; // Let the auto-format effect handle it

    setOutputFilenameState(getDefaultFilename());
  }, [operation, mp3SourceFile, retagFile, useAutoFilename, getDefaultFilename]);

  // Setter that disables auto-format when manually editing
  const setOutputFilename = useCallback((value: string) => {
    setOutputFilenameState(value);
    // Disable auto-format when user manually edits
    setUseAutoFilename(false);
  }, []);

  // Reset to initial state
  const reset = useCallback(() => {
    setOutputFilenameState("");
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
