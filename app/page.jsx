
'use client';

import React, { useState, useEffect, useRef } from 'react';
import 'shaka-player/dist/controls.css';
import { PlayCircle, Tv, Settings2, Activity } from 'lucide-react';

export default function DeepAnalysisPlayer() {
  // SSR Safety Check - Prevents Vercel Build Crashes
  const [isMounted, setIsMounted] = useState(false);

  // States
  const [channels, setChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Refs for Player and mutable state
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const uiRef = useRef(null);
  const tokenRef = useRef(""); 
  const logsRef = useRef([]);

  // Helper to append logs safely inside callbacks
  const addLog = (msg, type = 'req') => {
    const time = new Date().toISOString().substring(11, 23);
    const newLog = { time, msg, type };
    logsRef.current = [...logsRef.current.slice(-49), newLog]; // Keep last 50 logs
    setLogs(logsRef.current);
  };

  // 1. Mark as Mounted to render safely
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 2. Fetch APIs (Channels & Tokens)
  useEffect(() => {
    if (!isMounted) return;

    const fetchInitialData = async () => {
      try {
        // Fetch Token
        addLog("Fetching Authorization Tokens...", "req");
        const tokenRes = await fetch('https://allinonereborn2.online/jstrweb2/cookies.json');
        const tokenData = await tokenRes.json();
        
        // Extract cookie safely from the JSON array
        const extractedCookie = tokenData.find(item => item.cookie)?.cookie;
        if (extractedCookie) {
          tokenRef.current = extractedCookie; // e.g., "hdnea=st=..."
          addLog(`[AUTH] Token securely loaded into engine.`, "token");
        }

        // Fetch Channels
        addLog("Fetching Channel List...", "req");
        const channelRes = await fetch(`https://raw.githubusercontent.com/live4wap/links/refs/heads/main/jiomb?t=${new Date().getTime()}`);
        const channelData = await channelRes.json();
        
        setChannels(channelData);
        setIsLoading(false);
        addLog(`[SYSTEM] Loaded ${channelData.length} channels successfully.`, "res");

      } catch (error) {
        console.error("API Fetch Error:", error);
        addLog("[ERROR] Failed to fetch API data. Check CORS or Network.", "err");
        setIsLoading(false);
      }
    };

    fetchInitialData();
  }, [isMounted]);

  // 3. Initialize Shaka Player (Runs Once)
  useEffect(() => {
    if (!isMounted || !videoRef.current || playerRef.current) return;

    const initPlayer = async () => {
      const shaka = await import('shaka-player/dist/shaka-player.ui');
      shaka.polyfill.installAll();

      if (!shaka.Player.isBrowserSupported()) {
        addLog("[ERROR] Browser not supported for Shaka Player.", "err");
        return;
      }

      const video = videoRef.current;
      const container = containerRef.current;
      const player = new shaka.Player(video);
      
      // Setup UI (PiP, Quality, etc.)
      const ui = new shaka.ui.Overlay(player, container, video);
      ui.configure({
        controlPanelElements: [
          'play_pause', 'time_and_duration', 'spacer', 'mute', 
          'volume', 'picture_in_picture', 'quality', 'fullscreen'
        ]
      });

      // OUTGOING FILTER: Token Injection
      player.getNetworkingEngine().registerRequestFilter((type, request) => {
        const isManifest = type === shaka.net.NetworkingEngine.RequestType.MANIFEST;
        const isSegment = type === shaka.net.NetworkingEngine.RequestType.SEGMENT;

        if (isManifest || isSegment) {
          const currentToken = tokenRef.current;
          let uri = request.uris[0];

          // Append token if not present
          if (currentToken && !uri.includes('hdnea')) {
             const separator = uri.includes('?') ? '&' : '?';
             const cleanToken = currentToken.startsWith('?') ? currentToken.substring(1) : currentToken;
             request.uris[0] = uri + separator + cleanToken;
          }
          
          if (isManifest) {
             const fileName = uri.split('?')[0].split('/').pop();
             addLog(`-> REQ: MANIFEST: ${fileName}`, "req");
             if (currentToken) addLog(`   [AUTH] Appended Token to ${fileName}`, "token");
          }
        }
      });

      player.addEventListener('error', (e) => {
        const err = e.detail;
        if (err.code >= 6000 && err.code < 7000) {
          addLog(`[DRM ERROR ${err.code}] Key mismatch or unauthorized.`, "err");
        } else {
          addLog(`[ERROR] Playback failed. Code: ${err.code}`, "err");
        }
      });

      playerRef.current = player;
      uiRef.current = ui;
    };

    initPlayer();

    return () => {
      if (uiRef.current) uiRef.current.destroy();
      if (playerRef.current) playerRef.current.destroy();
    };
  }, [isMounted]);

  // 4. Handle Channel Playback & ClearKey DRM Setup
  useEffect(() => {
    if (!activeChannel || !playerRef.current) return;

    const playStream = async () => {
      const player = playerRef.current;
      addLog(`\n=========================================`, "req");
      addLog(`[PROCESS] Initiating: ${activeChannel.name}`, "req");

      try {
        await player.unload();
        
        let drmConfig = { clearKeys: {} };
        
        // Apply ClearKey only if keys exist and aren't "null" string
        if (activeChannel.keyId && activeChannel.key && activeChannel.keyId !== "null" && activeChannel.key !== "null") {
          drmConfig.clearKeys[activeChannel.keyId] = activeChannel.key;
          addLog(`[DRM] Injecting ClearKey -> ID: ${activeChannel.keyId}`, "drm");
        }

        // Configure Player
        player.configure({
          drm: drmConfig,
          manifest: { dash: { ignoreDrmInfo: false } }, // Shaka natively handles MPD/M3U8 based on URL mapping
          streaming: { bufferingGoal: 5 }
        });

        // Load standard .mpd or .m3u8 stream seamlessly
        await player.load(activeChannel.url);
        addLog(`[SUCCESS] PLAYBACK STARTED!`, "res");

      } catch (error) {
        addLog(`[ERROR] Failed to load stream.`, "err");
        console.error("Playback error:", error);
      }
    };

    playStream();
  }, [activeChannel]);

  if (!isMounted) return <div className="h-screen bg-black" />; // SSR Safety

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white font-sans overflow-hidden selection:bg-cyan-500/30">
      
      {/* Sidebar: Channel List */}
      <aside className="w-80 bg-[#111] border-r border-[#222] flex flex-col z-10 shadow-2xl">
        <div className="p-5 border-b border-[#222] flex items-center gap-3 bg-[#161616]">
          <Tv className="text-cyan-400" size={24} />
          <h1 className="text-lg font-bold tracking-wide">Deep Player</h1>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[#333] scrollbar-track-transparent">
          {isLoading ? (
            <div className="p-8 flex flex-col items-center text-gray-500 gap-3">
              <Activity className="animate-spin text-cyan-500" size={32} />
              <p className="text-sm">Fetching API & Tokens...</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {channels.map((channel, idx) => (
                <div
                  key={idx}
                  onClick={() => setActiveChannel(channel)}
                  className={`flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all duration-200 group
                    ${activeChannel?.name === channel.name 
                      ? 'bg-cyan-900/30 border border-cyan-800/50' 
                      : 'hover:bg-[#1a1a1a] border border-transparent'}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={channel.logo}
                    alt={channel.name}
                    onError={(e) => { e.target.src = 'https://via.placeholder.com/60?text=TV' }}
                    className="w-12 h-12 rounded-lg object-cover shadow-md group-hover:scale-105 transition-transform"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate text-gray-200 group-hover:text-white transition-colors">
                      {channel.name}
                    </h3>
                    <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider flex items-center gap-1">
                      {channel.keyId !== "null" ? (
                        <span className="text-emerald-500/80">• DRM ACTIVE</span>
                      ) : (
                        <span className="text-amber-500/80">• HLS/CLEAR</span>
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Main Area: Player & Logger */}
      <main className="flex-1 flex flex-col bg-black">
        
        {/* Video Container (70% Height) */}
        <div className="flex-1 relative flex items-center justify-center bg-gradient-to-b from-gray-900 to-black">
          {!activeChannel && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 z-0">
              <PlayCircle size={64} className="mb-4 opacity-20" />
              <p className="text-lg tracking-wider font-light">Select a stream to begin analysis</p>
            </div>
          )}
          
          <div 
            ref={containerRef} 
            className={`w-full max-w-5xl aspect-video shadow-2xl relative z-10 ${!activeChannel ? 'hidden' : 'block'}`}
          >
            <video 
              ref={videoRef} 
              className="w-full h-full object-contain bg-black" 
              autoPlay 
            />
          </div>
        </div>

        {/* Network Logger Terminal (30% Height) */}
        <div className="h-[30vh] bg-[#050505] border-t-2 border-cyan-900/50 flex flex-col">
          <div className="p-2 border-b border-[#111] bg-[#0a0a0a] flex items-center gap-2 text-xs text-gray-400 uppercase tracking-widest font-semibold">
            <Settings2 size={14} className="text-cyan-500" />
            Network Analysis Engine
          </div>
          
          <div className="flex-1 p-4 overflow-y-auto font-mono text-[11px] md:text-[13px] leading-relaxed scrollbar-thin scrollbar-thumb-gray-800">
            {logs.map((log, i) => (
              <div key={i} className="mb-1 flex gap-3">
                <span className="text-gray-600 select-none">[{log.time}]</span>
                <span className={`
                  ${log.type === 'req' && 'text-yellow-400'}
                  ${log.type === 'res' && 'text-emerald-400 font-bold'}
                  ${log.type === 'err' && 'text-red-500 font-bold'}
                  ${log.type === 'drm' && 'text-pink-500'}
                  ${log.type === 'token' && 'text-cyan-400 italic'}
                `}>
                  {log.msg}
                </span>
              </div>
            ))}
            <div ref={(el) => el && el.scrollIntoView()} />
          </div>
        </div>

      </main>
    </div>
  );
}
