'use client';

import React, { useEffect, useRef } from 'react';
import 'shaka-player/dist/controls.css';

export default function VideoPlayer({ streamUrl }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const uiRef = useRef(null);

  useEffect(() => {
    // Dynamic import to avoid SSR issues with Shaka Player
    const initPlayer = async () => {
      const shaka = await import('shaka-player/dist/shaka-player.ui');
      
      shaka.polyfill.installAll();
      if (!shaka.Player.isBrowserSupported()) {
        console.error('Browser not supported!');
        return;
      }

      const video = videoRef.current;
      const container = containerRef.current;

      const player = new shaka.Player(video);
      playerRef.current = player;

      // Initialize UI with features like PiP, fullscreen, and quality selection
      const ui = new shaka.ui.Overlay(player, container, video);
      uiRef.current = ui;

      const config = {
        controlPanelElements: [
          'play_pause', 'time_and_duration', 'spacer', 'mute', 
          'volume', 'picture_in_picture', 'quality', 'fullscreen'
        ]
      };
      ui.configure(config);

      player.addEventListener('error', (event) => {
        console.error('Error code', event.detail.code, 'object', event.detail);
      });

      if (streamUrl) {
        try {
          // Shaka automatically detects MPD vs M3U8 based on the manifest content/MIME type
          await player.load(streamUrl);
          console.log('The video has now been loaded!');
        } catch (e) {
          console.error('Error loading video', e);
        }
      }
    };

    initPlayer();

    // Cleanup on unmount
    return () => {
      if (uiRef.current) uiRef.current.destroy();
      if (playerRef.current) playerRef.current.destroy();
    };
  }, [streamUrl]);

  return (
    <div 
      ref={containerRef} 
      className="w-full max-w-4xl aspect-video bg-black shadow-lg rounded-lg overflow-hidden mx-auto relative"
    >
      <video 
        ref={videoRef} 
        className="w-full h-full"
        autoPlay 
      />
    </div>
  );
}
