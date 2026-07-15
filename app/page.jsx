'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import 'shaka-player/dist/controls.css';
import { Search, Tv, PlayCircle, X, Loader2 } from 'lucide-react';

// ==========================================
// OPTIMIZED CARD COMPONENT (Prevents Scroll Lag)
// ==========================================
const ChannelCard = React.memo(({ channel, isActive, onClick }) => (
  <button
    onClick={() => onClick(channel)}
    title={channel.name}
    className={`relative w-full aspect-square bg-white rounded-xl p-2 flex items-center justify-center 
      transform-gpu transition-transform duration-200 ease-out will-change-transform
      hover:scale-105 active:scale-95 shadow-sm
      ${isActive ? 'ring-4 ring-pink-500 scale-105 shadow-pink-500/50' : 'border border-gray-200/10'}`}
  >
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
      src={channel.logo}
      alt="logo"
      loading="lazy"
      decoding="async"
      onError={(e) => { e.target.src = 'https://via.placeholder.com/150?text=TV' }}
      className="w-full h-full object-contain pointer-events-none drop-shadow-sm"
    />
  </button>
));
ChannelCard.displayName = "ChannelCard";

export default function PerfectPlayerUI() {
  // SSR Safety
  const [isMounted, setIsMounted] = useState(false);

  // States
  const [channels, setChannels] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // UI States
  const [activeChannel, setActiveChannel] = useState(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Refs for Core Logic
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const uiRef = useRef(null);
  const tokenRef = useRef(""); 

  // 1. Mark as Mounted
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 2. Fetch Core APIs (Channels & Tokens)
  useEffect(() => {
    if (!isMounted) return;

    const fetchInitialData = async () => {
      try {
        const tokenRes = await fetch('https://allinonereborn2.online/jstrweb2/cookies.json');
        const tokenData = await tokenRes.json();
        const extractedCookie = tokenData.find(item => item.cookie)?.cookie;
        if (extractedCookie) {
          tokenRef.current = extractedCookie;
        }

        const channelRes = await fetch(`https://raw.githubusercontent.com/live4wap/links/refs/heads/main/jiomb?t=${new Date().getTime()}`);
        const channelData = await channelRes.json();
        
        setChannels(channelData);

        const cats = channelData.map(c => c.category || c.group || c.group_title || 'Others');
        const uniqueCats = ['All', ...new Set(cats)];
        setCategories(uniqueCats);

        setIsLoading(false);
      } catch (error) {
        console.error("API Fetch Error:", error);
        setIsLoading(false);
      }
    };

    fetchInitialData();
  }, [isMounted]);

  // 3. Initialize Shaka Player
  useEffect(() => {
    if (!isMounted || !videoRef.current || playerRef.current) return;

    const initPlayer = async () => {
      const shaka = await import('shaka-player/dist/shaka-player.ui');
      shaka.polyfill.installAll();

      if (!shaka.Player.isBrowserSupported()) return;

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

      playerRef.current = player;
      uiRef.current = ui;
    };

    initPlayer();

    return () => {
      if (uiRef.current) uiRef.current.destroy();
      if (playerRef.current) playerRef.current.destroy();
    };
  }, [isMounted]);

  // 4. Handle Channel Playback
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

  // High-performance Memos
  const filteredChannels = useMemo(() => {
    return channels.filter(c => {
      const cCat = c.category || c.group || c.group_title || 'Others';
      const matchCat = activeCategory === 'All' || cCat === activeCategory;
      const matchSearch = c.name?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [channels, activeCategory, searchQuery]);

  const similarChannels = useMemo(() => {
    if (!activeChannel) return [];
    const activeCat = activeChannel.category || activeChannel.group || activeChannel.group_title || 'Others';
    return channels.filter(c => {
      const cCat = c.category || c.group || c.group_title || 'Others';
      return cCat === activeCat && c.name !== activeChannel.name;
    });
  }, [channels, activeChannel]);

  const handleChannelSelect = useCallback((channel) => {
    setActiveChannel(channel);
  }, []);

  if (!isMounted) return <div className="h-screen w-screen bg-[#09090b]" />;

  return (
    // STRICT 100dvh Layout: Prevents mobile browser bar from hiding the bottom list
    <div className="flex flex-col md:flex-row h-[100dvh] w-full bg-[#0a0a0f] text-white font-sans overflow-hidden selection:bg-pink-500/30">
      
      {/* ======================= MAIN CONTENT (PLAYER & RELATED) ======================= */}
      {/* order-1 guarantees it stays strictly at the TOP on mobile devices */}
      <main className={`order-1 md:order-2 flex flex-col w-full z-20 bg-black transition-all duration-300
        ${!activeChannel ? 'hidden md:flex md:flex-1' : 'flex-none md:flex-1 md:h-full md:overflow-y-auto'}`}>
        
        {/* Shaka Video Player Container */}
        <div className="w-full aspect-video relative flex-shrink-0 bg-black flex items-center justify-center">
          {!activeChannel && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 to-black z-0">
              <PlayCircle size={70} className="text-white/10 mb-4 drop-shadow-lg" />
              <p className="text-xl tracking-widest font-light text-white/50">Select a channel</p>
            </div>
          )}
          
          <div ref={containerRef} className={`w-full h-full absolute inset-0 z-10 ${!activeChannel ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            <video 
              ref={videoRef} 
              className="w-full h-full bg-black object-contain" 
              autoPlay 
              playsInline
            />
          </div>
        </div>

        {/* Similar Category Channels Strip */}
        {activeChannel && (
          <div className="w-full bg-[#111116] border-t border-white/5 p-3 md:p-5 flex-shrink-0 shadow-lg">
            <h3 className="text-white/60 text-[11px] md:text-sm font-bold mb-3 uppercase tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-pink-500 animate-pulse"></span>
              More in {activeChannel.category || activeChannel.group || activeChannel.group_title || 'Category'}
            </h3>
            
            <div className="flex overflow-x-auto gap-3 pb-2 scrollbar-thin scrollbar-thumb-pink-600 scrollbar-track-transparent will-change-scroll transform-gpu">
              {similarChannels.length > 0 ? (
                similarChannels.map((c, idx) => (
                  <div key={idx} className="flex-shrink-0 w-[80px] md:w-[100px]">
                    <ChannelCard channel={c} isActive={false} onClick={handleChannelSelect} />
                  </div>
                ))
              ) : (
                <p className="text-xs text-gray-500 italic">No other channels found.</p>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ======================= SIDEBAR (FILTRATION & GRID) ======================= */}
      {/* order-2 puts this strictly at the BOTTOM on mobile devices. Takes exactly remaining flex-1 height */}
      <aside className={`order-2 md:order-1 flex flex-col w-full md:w-[350px] lg:w-[400px] bg-[#0f0f13] border-r border-white/5 z-10
        ${activeChannel ? 'flex-1 overflow-hidden' : 'h-full overflow-hidden'}`}>
        
        {/* Header: Live@8481 & Search */}
        <div className="p-4 flex flex-shrink-0 items-center justify-between border-b border-white/5 bg-[#141419]">
          <div className="flex items-center gap-2 text-pink-500">
            <Tv size={24} className="drop-shadow-[0_0_5px_rgba(236,72,153,0.5)]" />
            <h1 className="text-lg md:text-xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-indigo-400">
              Live@8481
            </h1>
          </div>
          
          <button 
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors text-gray-300 focus:outline-none"
          >
            {isSearchOpen ? <X size={20} /> : <Search size={20} />}
          </button>
        </div>

        {/* Search Input Area */}
        {isSearchOpen && (
          <div className="p-3 bg-[#111116] flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text" 
                placeholder="Search channels..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#1a1a20] border border-white/10 rounded-lg py-2.5 pl-9 pr-4 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 transition-colors"
              />
            </div>
          </div>
        )}

        {/* Categories Filtration Strip */}
        <div className="p-3 border-b border-white/5 bg-[#0a0a0f] flex-shrink-0">
          <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent will-change-scroll transform-gpu">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-bold tracking-wider transition-colors duration-200 ${
                  activeCategory === cat 
                  ? 'bg-pink-600 text-white shadow-md' 
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Extremely Fast Scrollable Grid */}
        {/* flex-1 enables scrolling strictly within this container, keeping the page rigid */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 p-3 md:p-4 will-change-scroll transform-gpu">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500">
              <Loader2 className="animate-spin text-pink-500" size={36} />
              <p className="tracking-widest text-xs font-semibold uppercase">Loading Engine...</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 md:grid-cols-3 gap-2 md:gap-3">
              {filteredChannels.map((channel, idx) => (
                <ChannelCard 
                  key={idx} 
                  channel={channel} 
                  isActive={activeChannel?.name === channel.name}
                  onClick={handleChannelSelect}
                />
              ))}
            </div>
          )}
          {!isLoading && filteredChannels.length === 0 && (
             <div className="text-center text-gray-500 text-sm mt-10">No channels match your criteria.</div>
          )}
        </div>
      </aside>

    </div>
  );
}
