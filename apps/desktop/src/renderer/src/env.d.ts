/// <reference types="vite/client" />
import type { AuroraLibraryApi } from '../../shared/library';
import type { AuroraLyricsApi } from '../../shared/lyrics';

declare global {
  interface Window {
    aurora?: {
      appName: string;
      version: string;
      library: AuroraLibraryApi;
      lyrics: AuroraLyricsApi;
    };
  }
}
