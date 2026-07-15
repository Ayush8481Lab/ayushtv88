'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import 'shaka-player/dist/controls.css';
import { Search, Tv, PlayCircle, X, Loader2 } from 'lucide-react';

export default function BeautifulPlayerUI() {
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

  // 2. Fetch Core APIs (Channels & Tokens) - Logic Maintained Strictly
  useEffect(() => {
    if (!isMounted) return;

    const fetchInitialData = async () => {
      try {
        // Fetch Token
        const tokenRes = await fetch('https://allinonereborn2.online/jstrweb2/cookies.json');
        const tokenData = await tokenRes.json();
        const extractedCookie = tokenData.find(item => item.cookie)?.cookie;
        if (extractedCookie) {
          tokenRef.current = extractedCookie;
        }

        // Fetch Channels
        const channelRes = await fetch(`https://raw.githubusercontent.com/live4wap/links/refs/heads/main/jiomb?t=${new Date().getTime()}`);
        const channelData = await channelRes.json();
        
        setChannels(channelData);

        // Derive Categories
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

  // 3. Initialize Shaka Player (Runs Once) - Logic Maintained Strictly
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

  // 4. Handle Channel Playback & ClearKey DRM Setup - Logic Maintained Strictly
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
        
        // Auto scroll to top on mobile when playing starts
        if (window.innerWidth < 768) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } catch (error) {
        console.error("Playback error:", error);
      }
    };

    playStream();
  }, [activeChannel]);

  // Filtering Memos
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


  // Shared UI Element: Channel Square Card (White BG, No Text)
  const ChannelCard = ({ channel }) => (
    <button
      onClick={() => setActiveChannel(channel)}
      title={channel.name}
      className={`relative group bg-white rounded-2xl p-2 md:p-3 shadow-lg flex items-center justify-center aspect-square transition-all duration-300 ease-in-out overflow-hidden hover:scale-105 hover:shadow-[0_0_20px_rgba(167,139,250,0.5)]
      ${activeChannel?.name === channel.name ? 'ring-4 ring-pink-500 scale-105' : 'border border-transparent'}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={channel.logo}
        alt="channel-logo"
        onError={(e) => { e.target.src = 'https://via.placeholder.com/150?text=TV' }}
        className="w-full h-full object-contain drop-shadow-md transition-transform group-hover:scale-110"
      />
    </button>
  );

  if (!isMounted) return <div className="min-h-screen bg-[#09090b]" />;

  return (
    <div className="flex flex-col md:flex-row min-h-screen md:h-screen bg-gradient-to-br from-[#0f0c29] via-[#302b63] to-[#24243e] text-white font-sans overflow-x-hidden selection:bg-pink-500/30">
      
      {/* ======================= DESKTOP & MOBILE SIDEBAR/HEADER ======================= */}
      <aside className="w-full md:w-[350px] lg:w-[400px] flex flex-col flex-shrink-0 bg-white/5 backdrop-blur-xl border-r border-white/10 shadow-2xl z-20">
        
        {/* Top Header: Live@8481 & Search Toggle */}
        <div className="p-4 md:p-6 flex items-center justify-between border-b border-white/10 bg-black/20">
          <div className="flex items-center gap-3 text-pink-500">
            <Tv size={28} className="drop-shadow-[0_0_8px_rgba(236,72,153,0.8)]" />
            <h1 className="text-xl md:text-2xl font-extrabold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-violet-400">
              Live@8481
            </h1>
          </div>
          
          <button 
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white focus:outline-none"
          >
            {isSearchOpen ? <X size={20} /> : <Search size={20} />}
          </button>
        </div>

        {/* Search Input Area */}
        {isSearchOpen && (
          <div className="p-4 bg-black/30 animate-in slide-in-from-top-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="Search channels..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all"
              />
            </div>
          </div>
        )}

        {/* Categories Filtration (Scrollable) */}
        <div className="p-4 border-b border-white/10 bg-black/10">
          <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-semibold tracking-wide transition-all ${
                  activeCategory === cat 
                  ? 'bg-gradient-to-r from-pink-600 to-violet-600 text-white shadow-[0_0_15px_rgba(219,39,119,0.5)]' 
                  : 'bg-white/10 text-gray-300 hover:bg-white/20'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* All Channels Grid (Sidebar/Bottom area) */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 p-4 md:p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400">
              <Loader2 className="animate-spin text-pink-500" size={40} />
              <p className="tracking-widest animate-pulse text-sm">Loading Channels...</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {filteredChannels.map((channel, idx) => (
                <ChannelCard key={idx} channel={channel} />
              ))}
            </div>
          )}
          {!isLoading && filteredChannels.length === 0 && (
             <div className="text-center text-gray-400 mt-10">No channels found.</div>
          )}
        </div>
      </aside>

      {/* ======================= MAIN CONTENT (PLAYER & RELATED) ======================= */}
      <main className="flex-1 flex flex-col relative bg-black/50 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-white/10">
        
        {/* Video Player Area */}
        <div className={`w-full relative shadow-2xl transition-all duration-500
          ${!activeChannel ? 'hidden md:flex flex-1' : 'aspect-video sticky md:relative top-0 z-10'}`}
        >
          {/* Placeholder if no channel selected (Desktop primarily) */}
          {!activeChannel && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm z-0">
              <PlayCircle size={80} className="text-white/10 mb-6 drop-shadow-2xl" />
              <p className="text-xl md:text-2xl tracking-widest font-light text-white/50">Select a channel to play</p>
            </div>
          )}
          
          {/* Shaka Container - Force 16:9 native filling */}
          <div 
            ref={containerRef} 
            className={`w-full h-full absolute inset-0 z-10 ${!activeChannel ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
          >
            <video 
              ref={videoRef} 
              className="w-full h-full bg-black object-contain" 
              autoPlay 
              playsInline
            />
          </div>
        </div>

        {/* Similar Category Channels (Bottom Scrollable) */}
        {activeChannel && (
          <div className="w-full bg-black/60 backdrop-blur-xl border-t border-white/10 p-4 md:p-6 pb-8 md:pb-6 shadow-xl animate-in fade-in duration-500">
            <h3 className="text-white/70 text-xs md:text-sm font-bold mb-4 uppercase tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-pink-500 animate-pulse"></span>
              More in {activeChannel.category || activeChannel.group || activeChannel.group_title || 'this category'}
            </h3>
            
            <div className="flex overflow-x-auto gap-4 pb-4 scrollbar-thin scrollbar-thumb-pink-500/50 scrollbar-track-black/20">
              {similarChannels.length > 0 ? (
                similarChannels.map((c, idx) => (
                  <div key={idx} className="flex-shrink-0 w-[100px] md:w-[120px]">
                    <ChannelCard channel={c} />
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500 italic">No other channels in this category.</p>
              )}
            </div>
          </div>
        )}
      </main>

    </div>
  );
}
