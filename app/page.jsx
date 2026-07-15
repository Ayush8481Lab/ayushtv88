'use client';

import React, { useState, useEffect, useRef } from 'react';
import 'shaka-player/dist/controls.css';
import { Search, X, ArrowLeft, PlayCircle, Activity, Tv } from 'lucide-react';

export default function App() {
  // ==============================================================
  // 1. EXACT STATE & REFS FROM YOUR WORKING CODE
  // ==============================================================
  const [isMounted, setIsMounted] = useState(false);
  const [channels, setChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // New UI specific states
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const uiRef = useRef(null);
  const tokenRef = useRef("");

  // ==============================================================
  // 2. EXACT API FETCH LOGIC FROM YOUR WORKING CODE
  // ==============================================================
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    const fetchInitialData = async () => {
      try {
        // Fetch Token exactly as working code
        const tokenRes = await fetch('https://allinonereborn2.online/jstrweb2/cookies.json');
        const tokenData = await tokenRes.json();
        
        const extractedCookie = tokenData.find(item => item.cookie)?.cookie;
        if (extractedCookie) {
          tokenRef.current = extractedCookie;
        }

        // Fetch Channels exactly as working code
        const channelRes = await fetch(`https://raw.githubusercontent.com/live4wap/links/refs/heads/main/jiomb?t=${new Date().getTime()}`);
        const channelData = await channelRes.json();
        
        // Setup UI Categories
        const uniqueCategories = ['All', ...Array.from(new Set(channelData.map(c => c.category).filter(Boolean)))];
        setCategories(uniqueCategories);
        setChannels(channelData);
        setIsLoading(false);
      } catch (error) {
        console.error("API Fetch Error:", error);
        setIsLoading(false);
      }
    };

    fetchInitialData();
  }, [isMounted]);

  // ==============================================================
  // 3. EXACT PLAYER INITIALIZATION FROM YOUR WORKING CODE
  // ==============================================================
  useEffect(() => {
    if (!isMounted || !videoRef.current || playerRef.current) return;

    const initPlayer = async () => {
      const shaka = await import('shaka-player/dist/shaka-player.ui');
      shaka.polyfill.installAll();

      if (!shaka.Player.isBrowserSupported()) {
        console.error("Browser not supported for Shaka Player.");
        return;
      }

      const video = videoRef.current;
      const container = containerRef.current;
      const player = new shaka.Player(video);
      
      const ui = new shaka.ui.Overlay(player, container, video);
      ui.configure({
        controlPanelElements: [
          'play_pause', 'time_and_duration', 'spacer', 'mute', 
          'volume', 'picture_in_picture', 'quality', 'fullscreen'
        ]
      });

      player.getNetworkingEngine().registerRequestFilter((type, request) => {
        const isManifest = type === shaka.net.NetworkingEngine.RequestType.MANIFEST;
        const isSegment = type === shaka.net.NetworkingEngine.RequestType.SEGMENT;

        if (isManifest || isSegment) {
          const currentToken = tokenRef.current;
          let uri = request.uris[0];

          if (currentToken && !uri.includes('hdnea')) {
             const separator = uri.includes('?') ? '&' : '?';
             const cleanToken = currentToken.startsWith('?') ? currentToken.substring(1) : currentToken;
             request.uris[0] = uri + separator + cleanToken;
          }
        }
      });

      player.addEventListener('error', (e) => {
        console.error("Player error:", e.detail);
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

  // ==============================================================
  // 4. EXACT PLAYBACK LOGIC FROM YOUR WORKING CODE
  // ==============================================================
  useEffect(() => {
    if (!activeChannel || !playerRef.current) return;

    const playStream = async () => {
      const player = playerRef.current;

      try {
        await player.unload();
        
        let drmConfig = { clearKeys: {} };
        
        if (activeChannel.keyId && activeChannel.key && activeChannel.keyId !== "null" && activeChannel.key !== "null") {
          drmConfig.clearKeys[activeChannel.keyId] = activeChannel.key;
        }

        player.configure({
          drm: drmConfig,
          manifest: { dash: { ignoreDrmInfo: false } }, 
          streaming: { bufferingGoal: 5 }
        });

        await player.load(activeChannel.url);
      } catch (error) {
        console.error("Playback error:", error);
      }
    };

    playStream();
  }, [activeChannel]);

  // ==============================================================
  // UI RENDER (Replaces Network Logs with Channel Details)
  // ==============================================================
  if (!isMounted) return <div className="h-screen bg-black" />;

  const filteredChannels = channels.filter(c => {
    const matchCategory = activeCategory === 'All' || c.category === activeCategory;
    const matchSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch;
  });

  const relatedChannels = activeChannel 
    ? channels.filter(c => c.category === activeChannel.category && c.id !== activeChannel.id)
    : [];

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#050505] text-cyan-500 flex-col gap-5">
         <Activity size={56} className="animate-spin" />
         <p className="font-semibold tracking-widest uppercase text-sm">Loading Ayush@8481...</p>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div className="flex flex-col h-screen bg-[#0a0a0a] text-white font-sans overflow-hidden">
        
        {/* NEW TOP NAVIGATION HEADER */}
        <header className="bg-[#111] border-b border-[#222] h-14 md:h-16 flex items-center justify-between px-3 md:px-5 z-20 flex-none shadow-md">
          <div className="flex items-center gap-2">
            {activeChannel && (
              <button 
                onClick={() => setActiveChannel(null)} 
                className="md:hidden text-gray-400 hover:text-white p-1.5 rounded-full hover:bg-gray-800 transition"
              >
                <ArrowLeft size={22} />
              </button>
            )}
            <h1 className="text-lg md:text-2xl font-black bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent tracking-wide">
              Ayush@8481
            </h1>
          </div>
          
          {/* Top Right Search */}
          <div className="flex items-center">
            {searchOpen ? (
              <div className="flex items-center bg-gray-900 border border-cyan-500/50 rounded-full px-3 py-1 md:py-1.5 shadow-[0_0_10px_rgba(6,182,212,0.2)]">
                <Search size={14} className="text-cyan-500 mr-2" />
                <input 
                  autoFocus
                  type="text" 
                  placeholder="Search channels..." 
                  className="bg-transparent border-none outline-none text-xs md:text-sm w-32 md:w-56 text-white placeholder-gray-500"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button onClick={() => { setSearchOpen(false); setSearchQuery(''); }} className="text-gray-500 hover:text-white ml-2">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button onClick={() => setSearchOpen(true)} className="p-2 rounded-full bg-gray-900 text-gray-400 hover:text-cyan-400 hover:bg-gray-800 transition-colors">
                <Search size={18} />
              </button>
            )}
          </div>
        </header>

        {/* MAIN BODY SPLIT (Exact layout structure from working code) */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* LEFT PANE: Channels & Categories */}
          <aside className={`flex flex-col bg-[#111] border-r border-[#222] transition-all duration-300
              ${activeChannel 
                ? 'hidden md:flex md:w-[320px] lg:w-[380px]' 
                : 'flex w-full'
              }`}
          >
            {/* Category Chips */}
            <div className="flex gap-2 overflow-x-auto scrollbar-hide px-3 py-2 bg-[#111] shadow-md flex-none border-b border-[#222]">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1 md:px-4 md:py-1.5 rounded-full whitespace-nowrap text-[11px] md:text-xs font-semibold transition-all duration-300 border
                    ${activeCategory === cat 
                      ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.3)]' 
                      : 'bg-transparent text-gray-400 border-gray-800 hover:border-gray-600 hover:text-white'
                    }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* High Density Grid */}
            <div className="flex-1 overflow-y-auto scrollbar-hide p-2 md:p-3">
              {filteredChannels.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-600">
                  <Search size={40} className="mb-3 opacity-20" />
                  <p className="text-sm">No channels found</p>
                </div>
              ) : (
                <div className={`grid gap-2 md:gap-3 ${activeChannel ? 'grid-cols-2 md:grid-cols-2' : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10'}`}>
                  {filteredChannels.map(channel => (
                    <div 
                      key={channel.id}
                      onClick={() => setActiveChannel(channel)}
                      className={`cursor-pointer rounded-lg flex flex-col p-1.5 md:p-2 overflow-hidden transition-all duration-200 group
                        ${activeChannel?.id === channel.id 
                            ? 'border border-cyan-500 bg-cyan-900/20 shadow-[inset_3px_0_0_#06b6d4]' 
                            : 'border border-transparent bg-gray-900/30 hover:bg-gray-800 hover:border-gray-700'}`
                      }
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src={channel.logo} 
                        onError={(e) => { e.target.src = 'https://via.placeholder.com/100?text=TV' }}
                        className="w-full aspect-video object-cover bg-black rounded opacity-90 group-hover:opacity-100 transition-opacity"
                      />
                      <div className="flex-1 min-w-0 pt-2">
                        <h3 className={`font-semibold text-gray-200 group-hover:text-white truncate ${activeChannel ? 'text-[10px] md:text-[11px]' : 'text-[10px] md:text-xs'}`}>{channel.name}</h3>
                        <p className={`text-gray-500 truncate ${activeChannel ? 'text-[9px] md:text-[10px]' : 'text-[9px] md:text-[10px]'}`}>{channel.category}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>

          {/* RIGHT PANE: EXACTLY like "Main Area" in your working code */}
          <main className={`flex-1 flex flex-col bg-black ${!activeChannel ? 'hidden md:flex' : 'flex'}`}>
            
            {/* 70% HEIGHT: VIDEO AREA */}
            <div className="flex-1 relative flex items-center justify-center bg-gradient-to-b from-gray-900 to-black">
              {!activeChannel && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 z-0">
                  <PlayCircle size={64} className="mb-4 opacity-20" />
                  <p className="text-lg tracking-wider font-light">Select a stream to begin playback</p>
                </div>
              )}
              
              {/* This exact video block structure is from your working file! */}
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

            {/* 30% HEIGHT: REPLACES NETWORK LOGS WITH BEAUTIFUL UI */}
            <div className="h-[35vh] md:h-[30vh] bg-[#050505] border-t-2 border-cyan-900/50 flex flex-col">
              <div className="p-2 border-b border-[#111] bg-[#0a0a0a] flex items-center gap-2 text-xs text-gray-400 uppercase tracking-widest font-semibold">
                <Tv size={14} className="text-cyan-500" />
                {activeChannel ? `${activeChannel.name} • ${activeChannel.category}` : 'Channel Information'}
              </div>
              
              <div className="flex-1 p-4 overflow-y-auto scrollbar-hide">
                {activeChannel ? (
                  <>
                    <h3 className="text-sm md:text-base font-bold text-gray-400 mb-3">More channels in this category</h3>
                    <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 snap-x">
                      {relatedChannels.map(channel => (
                        <div 
                          key={channel.id}
                          onClick={() => setActiveChannel(channel)}
                          className="snap-start flex-none w-32 md:w-40 cursor-pointer group"
                        >
                          <div className="w-full aspect-video rounded-lg overflow-hidden border border-gray-800 bg-gray-900 group-hover:border-cyan-500 transition-all relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={channel.logo} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all duration-300" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-2">
                              <PlayCircle className="text-cyan-400 w-6 h-6" />
                            </div>
                          </div>
                          <h4 className="font-medium text-[11px] md:text-xs mt-1.5 text-gray-400 group-hover:text-white truncate">{channel.name}</h4>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-gray-600 text-sm h-full flex items-center justify-center">
                    Waiting for engine selection...
                  </div>
                )}
              </div>
            </div>

          </main>
        </div>
      </div>
    </>
  );
}
