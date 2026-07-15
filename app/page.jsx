'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import 'shaka-player/dist/controls.css';
import { Search, Tv, PlayCircle, X, Loader2, ArrowLeft } from 'lucide-react';

// ==========================================
// OPTIMIZED CARD COMPONENT (White Square Logo Only)
// ==========================================
const ChannelCard = React.memo(({ channel, isActive, onClick }) => (
  <button
    onClick={() => onClick(channel)}
    title={channel.name}
    className={`relative w-full aspect-square bg-white rounded-xl p-2 md:p-3 flex items-center justify-center 
      transform-gpu transition-transform duration-200 ease-out will-change-transform
      hover:scale-105 active:scale-95 shadow-sm
      ${isActive ? 'ring-4 ring-pink-500 scale-105 shadow-[0_0_15px_rgba(236,72,153,0.5)]' : 'border border-gray-200/10'}`}
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
  const activeChannelRef = useRef(null);

  // 1. Mark as Mounted
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Update activeChannelRef whenever it changes (for Network Engine)
  useEffect(() => {
    activeChannelRef.current = activeChannel;
  }, [activeChannel]);

  // 2. Fetch Core APIs (Standard, Premium, & Custom Channels)
  useEffect(() => {
    if (!isMounted) return;

    const fetchInitialData = async () => {
      try {
        // Fetch Global Token
        const tokenRes = await fetch('https://allinonereborn2.online/jstrweb2/cookies.json');
        const tokenData = await tokenRes.json();
        const extractedCookie = tokenData.find(item => item.cookie)?.cookie;
        if (extractedCookie) tokenRef.current = extractedCookie;

        // Fetch Standard Channels
        const standardRes = await fetch(`https://raw.githubusercontent.com/live4wap/links/refs/heads/main/jiomb?t=${new Date().getTime()}`);
        const standardData = await standardRes.json();

        // Fetch Premium Channels
        let premiumData = [];
        try {
          const premRes = await fetch(`https://sayan-json-3.pages.dev/Data/sports.json?t=${new Date().getTime()}`);
          const premJson = await premRes.json();
          
          if (premJson && premJson.channels) {
            premiumData = premJson.channels.map(c => {
              let logoName = c.id; 
              const match = c.stream_url.match(/\/bpk-tv\/(.*?)\/WDVLive/i);
              if (match) logoName = match[1].replace(/_(BTS|MOB|xyz)$/i, '');

              return {
                name: c.name,
                url: c.stream_url,
                keyId: c.key_id,
                key: c.key,
                cookie: c.cookie,
                category: 'Premium',
                logo: `https://jiotv.catchup.cdn.jio.com/dare_images/images/${logoName}.png`
              };
            });
          }
        } catch (e) {
          console.error("Premium API Error:", e);
        }

        // Add User Requested Custom Channels (M3U8)
        const customChannels = [
          {
            name: "Dangal",
            url: "https://live-dangal.akamaized.net/liveabr/pub-iodang10p4al/live_720p/chunks.m3u8",
            keyId: "null",
            key: "null",
            cookie: "",
            category: "Entertainment",
            logo: "https://dangaplay-json.s3.ap-south-1.amazonaws.com/Dangal_1x1.jpg?bf=0&f=jpg&p=true&q=85&w=300"
          },
          {
            name: "Dangal 2",
            url: "https://live-dangal2.akamaized.net/liveabr/pub-iodanga2a26kj2/live_720p/chunks.m3u8",
            keyId: "null",
            key: "null",
            cookie: "",
            category: "Entertainment",
            logo: "https://dangaplay-json.s3.ap-south-1.amazonaws.com/Dangal2_1x1.jpg?bf=0&f=jpg&p=true&q=85&w=50"
          },
          {
            name: "Bhojpuri Cinema",
            url: "https://live-bhojpuri.akamaized.net/liveabr/pub-iobhojpuqbu6yj/live_720p/chunks.m3u8",
            keyId: "null",
            key: "null",
            cookie: "",
            category: "Bhojpuri",
            logo: "https://dangaplay-json.s3.ap-south-1.amazonaws.com/BhojpuriCinema_1x1.jpg?bf=0&f=jpg&p=true&q=85&w=250"
          }
        ];

        // Combine All Data
        const combined = [...premiumData, ...customChannels, ...standardData];
        setChannels(combined);

        // Map Categories (Force 'Premium' next to 'All')
        const allCats = combined.map(c => c.category || c.group || c.group_title || 'Others');
        const uniqueCats = new Set(allCats);
        
        const sortedCategories = ['All'];
        if (uniqueCats.has('Premium')) {
          sortedCategories.push('Premium');
          uniqueCats.delete('Premium');
        }
        uniqueCats.forEach(cat => sortedCategories.push(cat));
        
        setCategories(sortedCategories);
        setIsLoading(false);
      } catch (error) {
        console.error("Master API Fetch Error:", error);
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

      // Maintain proper cookie logic
      player.getNetworkingEngine().registerRequestFilter((type, request) => {
        const isManifest = type === shaka.net.NetworkingEngine.RequestType.MANIFEST;
        const isSegment = type === shaka.net.NetworkingEngine.RequestType.SEGMENT;

        if (isManifest || isSegment) {
          const currentChannel = activeChannelRef.current;
          const currentToken = currentChannel?.cookie ? currentChannel.cookie : tokenRef.current;
          
          let uri = request.uris[0];
          
          if (currentToken && !uri.includes('st=') && !uri.includes('hdnea')) {
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

  // 4. Handle Channel Playback & System Notification Media
  useEffect(() => {
    if (!playerRef.current) return;

    const playStream = async () => {
      const player = playerRef.current;
      
      if (!activeChannel) {
        try { await player.unload(); } catch (e) {}
        return;
      }

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

        // Update Notification Control Center (MediaSession API)
        if ('mediaSession' in navigator) {
          navigator.mediaSession.metadata = new window.MediaMetadata({
            title: activeChannel.name,
            artist: 'Ayush@8481', // Requested Artist Name
            artwork: [
              { src: activeChannel.logo, sizes: '512x512' }
            ]
          });
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

  const handleChannelSelect = useCallback((channel) => {
    setActiveChannel(channel);
    setSearchQuery(''); // Clears search when channel is selected
  }, []);

  const handleBackToMain = () => setActiveChannel(null);

  if (!isMounted) return <div className="h-screen w-screen bg-[#09090b]" />;

  return (
    <div className="flex h-[100dvh] w-full bg-[#0a0a0f] text-white font-sans overflow-hidden selection:bg-pink-500/30">
      
      {/* ======================= MAIN PAGE (GRID VIEW) ======================= */}
      {/* Hides entirely when watching a video to fix landscape/tablet issues */}
      <aside className={`flex flex-col bg-[#0f0f13] border-r border-white/5 z-10
        ${activeChannel ? 'hidden' : 'flex-1 w-full md:w-[400px] lg:w-[450px] md:flex-none'}`}>
        
        <div className="p-4 flex flex-shrink-0 items-center justify-between border-b border-white/5 bg-[#141419]">
          <div className="flex items-center gap-2 text-pink-500">
            <Tv size={24} className="drop-shadow-[0_0_5px_rgba(236,72,153,0.5)]" />
            <h1 className="text-lg md:text-xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-indigo-400">
              Live@8481
            </h1>
          </div>
          <button onClick={() => setIsSearchOpen(!isSearchOpen)} className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors">
            {isSearchOpen ? <X size={20} /> : <Search size={20} />}
          </button>
        </div>

        {isSearchOpen && (
          <div className="p-3 bg-[#111116] flex-shrink-0 animate-in slide-in-from-top-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text" 
                placeholder="Search channels..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#1a1a20] border border-white/10 rounded-lg py-2.5 pl-9 pr-4 text-sm text-white focus:outline-none focus:border-pink-500 transition-colors"
              />
            </div>
          </div>
        )}

        <div className="p-3 border-b border-white/5 bg-[#0a0a0f] flex-shrink-0">
          <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[13px] font-bold tracking-wider transition-colors duration-200 ${
                  activeCategory === cat 
                  ? 'bg-gradient-to-r from-pink-600 to-indigo-600 text-white shadow-md' 
                  : cat === 'Premium' 
                  ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 p-3 md:p-4 will-change-scroll transform-gpu">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500">
              <Loader2 className="animate-spin text-pink-500" size={36} />
              <p className="tracking-widest text-xs font-semibold uppercase">Loading Engine...</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3">
              {filteredChannels.map((channel, idx) => (
                <ChannelCard key={idx} channel={channel} isActive={activeChannel?.name === channel.name} onClick={handleChannelSelect} />
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* ======================= PLAYER PAGE (WATCH VIEW) ======================= */}
      {/* Empty State player on desktop, Full Youtube UI when active */}
      <main className={`flex-col bg-black z-20 transition-all duration-0
        ${activeChannel ? 'flex w-full h-[100dvh]' : 'hidden md:flex flex-1 h-[100dvh]'}`}>
        
        {/* Watch View Header (Visible on ALL devices when playing) */}
        {activeChannel && (
          <div className="flex items-center justify-between p-3 bg-[#141419] border-b border-white/10 shadow-lg z-30 flex-shrink-0 w-full">
            <div className="flex items-center gap-3">
              <button onClick={handleBackToMain} className="flex items-center gap-2 text-pink-500 font-bold hover:text-pink-400 bg-white/5 py-1.5 px-3 rounded-lg transition-colors">
                <ArrowLeft size={18} />
                <span className="text-sm tracking-wider">BACK</span>
              </button>
              <div className="text-white/90 text-sm md:text-base font-semibold truncate max-w-[180px] md:max-w-none">
                {activeChannel.name}
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2 text-pink-500 mr-2 opacity-80">
              <Tv size={18} />
              <h1 className="text-sm font-black tracking-widest">Live@8481</h1>
            </div>
          </div>
        )}

        <div className={`flex flex-col landscape:flex-row md:flex-row flex-1 overflow-hidden`}>
          
          {/* Main Video Area */}
          <div className="w-full landscape:flex-1 md:flex-1 relative bg-black flex-shrink-0 flex items-center justify-center aspect-video landscape:aspect-auto md:aspect-auto">
            {!activeChannel && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a0f] z-0">
                <PlayCircle size={70} className="text-white/5 mb-4 drop-shadow-lg" />
                <p className="text-xl tracking-widest font-light text-white/20">Select a channel to play</p>
              </div>
            )}
            <div ref={containerRef} className={`w-full h-full absolute inset-0 z-10 ${!activeChannel ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              <video ref={videoRef} className="w-full h-full bg-black object-contain" autoPlay playsInline />
            </div>
          </div>

          {/* Similar Category Area (Right Sidebar on Landscape/Desktop, Bottom on Portrait Mobile) */}
          {activeChannel && (
            <div className="w-full landscape:w-[280px] md:w-[320px] lg:w-[350px] flex-1 landscape:flex-none md:flex-none 
                            bg-[#111116] border-t landscape:border-t-0 landscape:border-l md:border-t-0 md:border-l border-white/5 
                            p-3 md:p-4 shadow-inner flex flex-col overflow-hidden">
              <h3 className="text-white/60 text-[11px] md:text-sm font-bold mb-3 uppercase tracking-widest flex items-center gap-2 flex-shrink-0">
                <span className="w-2 h-2 rounded-full bg-pink-500 animate-pulse"></span>
                More in {activeChannel.category || 'Category'}
              </h3>
              
              {/* 1. Mobile Portrait View: Horizontal Strip */}
              <div className="flex flex-row landscape:hidden md:hidden overflow-x-auto gap-3 pb-2 scrollbar-thin scrollbar-thumb-pink-600 scrollbar-track-transparent">
                {similarChannels.map((c, idx) => (
                  <div key={idx} className="flex-shrink-0 w-[90px]">
                    <ChannelCard channel={c} isActive={false} onClick={handleChannelSelect} />
                  </div>
                ))}
              </div>

              {/* 2. Desktop & Landscape Mobile View: Vertical Grid (Top-to-Bottom) */}
              <div className="hidden landscape:grid md:grid grid-cols-2 gap-3 pb-2 overflow-y-auto scrollbar-thin scrollbar-thumb-pink-600 scrollbar-track-transparent content-start pr-1">
                {similarChannels.map((c, idx) => (
                  <ChannelCard key={idx} channel={c} isActive={false} onClick={handleChannelSelect} />
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

    </div>
  );
}
