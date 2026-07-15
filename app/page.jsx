'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import 'shaka-player/dist/controls.css';
import { Search, Tv, PlayCircle, X, Loader2, ArrowLeft, WifiOff, AlertTriangle, RefreshCcw, Heart } from 'lucide-react';

// ==========================================
// OPTIMIZED CARD COMPONENT (Hotstar/Jio Style Lazy Loading)
// ==========================================
const ChannelCard = React.memo(({ channel, isActive, onClick }) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  return (
    <button
      onClick={() => onClick(channel)}
      title={channel.name}
      className={`relative w-full aspect-square bg-white rounded-xl p-2 md:p-3 flex items-center justify-center 
        transition-all duration-300 ease-in-out hover:scale-105 active:scale-95
        ${isActive ? 'ring-4 ring-pink-500 scale-105 shadow-[0_0_15px_rgba(236,72,153,0.5)]' : 'border border-blue-900/20 shadow-sm'}`}
    >
      {(!loaded || error) && (
        <div className="absolute inset-0 flex items-center justify-center p-2">
          <span className="text-[10px] md:text-xs font-bold text-gray-800 text-center uppercase tracking-wider leading-tight">
            {channel.name}
          </span>
        </div>
      )}
      
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={channel.logo}
        alt="logo"
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={`w-full h-full object-contain pointer-events-none transition-opacity duration-500 
          ${loaded && !error ? 'opacity-100' : 'opacity-0'}`}
      />
    </button>
  );
});
ChannelCard.displayName = "ChannelCard";

// ==========================================
// DYNAMIC M3U8 MASTER GENERATOR FOR QUALITY
// ==========================================
const buildMasterPlaylist = (url) => {
  const base = url.substring(0, url.indexOf('/live_'));
  return `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=426x240,CODECS="avc1.4d4015,mp4a.40.2"
${base}/live_240p/chunks.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.4d401e,mp4a.40.2"
${base}/live_360p/chunks.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=854x480,CODECS="avc1.4d401f,mp4a.40.2"
${base}/live_480p/chunks.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2"
${base}/live_720p/chunks.m3u8`;
};

// Required Category Order
const CATEGORY_ORDER = ['All', 'Premium', 'Favorites', 'Sports', 'Entertainment', 'News', 'Movies', 'Music', 'Kids', 'Bhojpuri'];

export default function PerfectPlayerUI() {
  // Core States
  const [isMounted, setIsMounted] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [playerError, setPlayerError] = useState(null);

  // Data States
  const [channels, setChannels] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Storage States (Favorites & Last Played)
  const [favorites, setFavorites] = useState([]);
  const [lastPlayed, setLastPlayed] = useState(null);

  // UI States
  const [activeChannel, setActiveChannel] = useState(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Refs
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const uiRef = useRef(null);
  const tokenRef = useRef(""); 
  const activeChannelRef = useRef(null);

  // 1. Mark as Mounted, Load LocalStorage & Setup Network
  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== 'undefined') {
      setIsOffline(!navigator.onLine);
      window.addEventListener('online', () => setIsOffline(false));
      window.addEventListener('offline', () => setIsOffline(true));

      // Load Storage
      const storedFavs = JSON.parse(localStorage.getItem('fav_channels_8481') || '[]');
      setFavorites(storedFavs);
      
      const storedLast = JSON.parse(localStorage.getItem('last_played_8481') || 'null');
      setLastPlayed(storedLast);
    }
  }, []);

  useEffect(() => {
    activeChannelRef.current = activeChannel;
  }, [activeChannel]);

  // 2. Fetch Core APIs
  useEffect(() => {
    if (!isMounted || isOffline) return;

    const fetchInitialData = async () => {
      try {
        setIsLoading(true);
        const tokenRes = await fetch('https://allinonereborn2.online/jstrweb2/cookies.json');
        const tokenData = await tokenRes.json();
        const extractedCookie = tokenData.find(item => item.cookie)?.cookie;
        if (extractedCookie) tokenRef.current = extractedCookie;

        const standardRes = await fetch(`https://jtvxweb.pages.dev/jstr4web.json?t=${new Date().getTime()}`);
        const standardData = await standardRes.json();

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
                name: c.name, url: c.stream_url, keyId: c.key_id, key: c.key, cookie: c.cookie,
                category: 'Premium', logo: `https://jiotv.catchup.cdn.jio.com/dare_images/images/${logoName}.png`
              };
            });
          }
        } catch (e) { console.error("Premium Fetch Error", e); }

        const customChannels = [
          { name: "Dangal", url: "https://live-dangal.akamaized.net/liveabr/pub-iodang10p4al/live_720p/chunks.m3u8", keyId: "null", key: "null", cookie: "", category: "Entertainment", logo: "https://dangaplay-json.s3.ap-south-1.amazonaws.com/Dangal_1x1.jpg?bf=0&f=jpg&p=true&q=85&w=300" },
          { name: "Dangal 2", url: "https://live-dangal2.akamaized.net/liveabr/pub-iodanga2a26kj2/live_720p/chunks.m3u8", keyId: "null", key: "null", cookie: "", category: "Entertainment", logo: "https://dangaplay-json.s3.ap-south-1.amazonaws.com/Dangal2_1x1.jpg?bf=0&f=jpg&p=true&q=85&w=50" },
          { name: "Bhojpuri Cinema", url: "https://live-bhojpuri.akamaized.net/liveabr/pub-iobhojpuqbu6yj/live_720p/chunks.m3u8", keyId: "null", key: "null", cookie: "", category: "Bhojpuri", logo: "https://dangaplay-json.s3.ap-south-1.amazonaws.com/BhojpuriCinema_1x1.jpg?bf=0&f=jpg&p=true&q=85&w=250" }
        ];

        const combined = [...premiumData, ...customChannels, ...standardData];
        setChannels(combined);

        // Map & Sort Categories
        const allCats = combined.map(c => c.category || c.group || c.group_title || 'Others');
        const uniqueCats = new Set(allCats);
        
        const finalCategories = [...CATEGORY_ORDER];
        CATEGORY_ORDER.forEach(cat => uniqueCats.delete(cat));
        uniqueCats.forEach(cat => finalCategories.push(cat));
        
        setCategories(finalCategories);
        setIsLoading(false);
      } catch (error) {
        console.error("Master API Fetch Error:", error);
        setIsLoading(false);
      }
    };

    fetchInitialData();
  }, [isMounted, isOffline]);

  // 3. Initialize Shaka Player
  useEffect(() => {
    if (!isMounted || isOffline || !videoRef.current || playerRef.current) return;

    const initPlayer = async () => {
      const shaka = await import('shaka-player/dist/shaka-player.ui');
      shaka.polyfill.installAll();

      if (!shaka.Player.isBrowserSupported()) return;

      const video = videoRef.current;
      const container = containerRef.current;
      const player = new shaka.Player(video);
      
      const ui = new shaka.ui.Overlay(player, container, video);
      ui.configure({
        controlPanelElements: ['play_pause', 'time_and_duration', 'spacer', 'mute', 'volume', 'picture_in_picture', 'quality', 'fullscreen']
      });

      player.addEventListener('error', (e) => {
        console.error('Shaka Player Error', e.detail);
        setPlayerError("Stream unavailable or DRM error. Please try another channel.");
      });

      player.getNetworkingEngine().registerRequestFilter((type, request) => {
        const isManifest = type === shaka.net.NetworkingEngine.RequestType.MANIFEST;
        const isSegment = type === shaka.net.NetworkingEngine.RequestType.SEGMENT;
        if (isManifest || isSegment) {
          const currentChannel = activeChannelRef.current;
          const currentToken = currentChannel?.cookie ? currentChannel.cookie : tokenRef.current;
          let uri = request.uris[0];
          
          if (currentToken && uri.includes('.jio.com') && !uri.includes('st=') && !uri.includes('hdnea')) {
             const sep = uri.includes('?') ? '&' : '?';
             const cleanToken = currentToken.startsWith('?') ? currentToken.substring(1) : currentToken;
             request.uris[0] = uri + sep + cleanToken;
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
  }, [isMounted, isOffline]);

  // 4. Handle Channel Playback
  const executePlayStream = useCallback(async () => {
    if (!playerRef.current || !activeChannel) return;
    const player = playerRef.current;
    
    setPlayerError(null);

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

      let finalUrl = activeChannel.url;
      let forceMimeType = undefined;

      if (finalUrl.includes('/live_') && finalUrl.includes('/chunks.m3u8')) {
         const masterStr = buildMasterPlaylist(finalUrl);
         const blob = new Blob([masterStr], { type: 'application/x-mpegURL' });
         finalUrl = URL.createObjectURL(blob);
         forceMimeType = 'application/x-mpegURL'; 
      }

      if (forceMimeType) await player.load(finalUrl, null, forceMimeType);
      else await player.load(finalUrl);

      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new window.MediaMetadata({
          title: activeChannel.name,
          artist: 'Ayush@8481', 
          artwork: [{ src: activeChannel.logo, sizes: '512x512' }]
        });
      }

    } catch (error) {
      console.error("Playback error:", error);
      setPlayerError("Failed to fetch stream data. Ensure your connection is stable.");
    }
  }, [activeChannel]);

  useEffect(() => {
    executePlayStream();
    return () => { if (!activeChannel && playerRef.current) playerRef.current.unload(); }
  }, [executePlayStream, activeChannel]);

  // Favorites Toggle Logic
  const toggleFavorite = () => {
    if (!activeChannel) return;
    const isFav = favorites.includes(activeChannel.name);
    let newFavs;
    if (isFav) {
      newFavs = favorites.filter(name => name !== activeChannel.name);
    } else {
      newFavs = [...favorites, activeChannel.name];
    }
    setFavorites(newFavs);
    localStorage.setItem('fav_channels_8481', JSON.stringify(newFavs));
  };

  // Memos - Advanced Filtration
  const filteredChannels = useMemo(() => {
    return channels.filter(c => {
      const matchSearch = c.name?.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchSearch) return false;

      const cCat = c.category || c.group || c.group_title || 'Others';

      if (activeCategory === 'All') return true;
      if (activeCategory === 'Favorites') return favorites.includes(c.name);
      
      // Sports Category: Show regular sports OR premium channels containing "sport"
      if (activeCategory === 'Sports') {
        return cCat === 'Sports' || (cCat === 'Premium' && /sport/i.test(c.name));
      }
      
      return cCat === activeCategory;
    });
  }, [channels, activeCategory, searchQuery, favorites]);

  const similarChannels = useMemo(() => {
    if (!activeChannel) return [];
    const activeCat = activeChannel.category || activeChannel.group || activeChannel.group_title || 'Others';
    return channels.filter(c => {
      const cCat = c.category || c.group || c.group_title || 'Others';
      return cCat === activeCat && c.name !== activeChannel.name;
    });
  }, [channels, activeChannel]);

  // Handle Selection (Saves to Last Played)
  const handleChannelSelect = useCallback((channel) => {
    setActiveChannel(channel);
    setSearchQuery('');
    
    // Save as Continue Watching
    setLastPlayed(channel);
    localStorage.setItem('last_played_8481', JSON.stringify(channel));
  }, []);

  if (!isMounted) return <div className="h-screen w-screen bg-[#020813]" />;

  // ----------------------------------------------------
  // OFFLINE UI (Navy Theme)
  // ----------------------------------------------------
  if (isOffline) {
    return (
      <div className="flex flex-col items-center justify-center h-[100dvh] w-full bg-[#020813] text-white">
        <WifiOff size={70} className="text-pink-500 mb-6 drop-shadow-[0_0_15px_rgba(236,72,153,0.5)] animate-pulse" />
        <h1 className="text-2xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-indigo-400 mb-2">
          NO INTERNET
        </h1>
        <p className="text-blue-200/50 text-sm mb-8 text-center max-w-[250px] leading-relaxed">
          Please check your network connection and try again.
        </p>
        <button onClick={() => { if(navigator.onLine) setIsOffline(false); }}
          className="flex items-center gap-2 px-8 py-3 bg-blue-900/20 hover:bg-blue-900/40 border border-blue-400/20 rounded-full font-bold tracking-widest transition-colors"
        >
          <RefreshCcw size={18} /> RETRY
        </button>
      </div>
    );
  }

  // ----------------------------------------------------
  // MAIN APP UI (Deep Navy Theme)
  // ----------------------------------------------------
  return (
    <div className="flex h-[100dvh] w-full bg-[#020813] text-white font-sans overflow-hidden selection:bg-pink-500/30">
      
      {/* SIDEBAR / MAIN GRID */}
      <aside className={`flex flex-col bg-[#061121] border-r border-blue-400/10 z-10 
        ${activeChannel ? 'hidden' : 'flex-1 w-full md:w-[400px] lg:w-[450px] md:flex-none'}`}>
        
        <div className="p-4 flex flex-shrink-0 items-center justify-between border-b border-blue-400/10 bg-[#0a182b]">
          <div className="flex items-center gap-2 text-pink-500">
            <Tv size={24} className="drop-shadow-[0_0_5px_rgba(236,72,153,0.5)]" />
            <h1 className="text-lg md:text-xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-indigo-400">
              Live@8481
            </h1>
          </div>
          <button onClick={() => setIsSearchOpen(!isSearchOpen)} className="p-2 rounded-full bg-blue-900/20 hover:bg-blue-900/40 transition-colors text-blue-200">
            {isSearchOpen ? <X size={20} /> : <Search size={20} />}
          </button>
        </div>

        {isSearchOpen && (
          <div className="p-3 bg-[#0a182b] flex-shrink-0 animate-in slide-in-from-top-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400/50" size={16} />
              <input type="text" placeholder="Search channels..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#11223d] border border-blue-400/20 rounded-lg py-2.5 pl-9 pr-4 text-sm text-white focus:outline-none focus:border-pink-500 transition-colors"
              />
            </div>
          </div>
        )}

        <div className="p-3 border-b border-blue-400/10 bg-[#061121] flex-shrink-0">
          <div className="flex overflow-x-auto gap-2 pb-2 scroll-smooth overscroll-none scrollbar-thin scrollbar-thumb-blue-500/20 scrollbar-track-transparent">
            {categories.map((cat) => (
              <button key={cat} onClick={() => setActiveCategory(cat)}
                className={`whitespace-nowrap flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[13px] font-bold tracking-wider transition-colors duration-200 ${
                  activeCategory === cat 
                  ? 'bg-gradient-to-r from-pink-600 to-indigo-600 text-white shadow-md' 
                  : cat === 'Favorites'
                  ? 'bg-pink-500/10 text-pink-400 hover:bg-pink-500/20 border border-pink-500/20'
                  : cat === 'Premium' 
                  ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20' 
                  : 'bg-blue-900/20 text-blue-200/70 hover:bg-blue-900/40'
                }`}
              >
                {cat === 'Favorites' && <Heart size={13} className={activeCategory === 'Favorites' ? "fill-white" : "fill-pink-400"} />}
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scroll-smooth overscroll-none scrollbar-thin scrollbar-thumb-blue-500/20 p-3 md:p-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-blue-400/50">
              <Loader2 className="animate-spin text-pink-500" size={36} />
              <p className="tracking-widest text-xs font-semibold uppercase">Conecting to Live8481</p>
            </div>
          ) : (
            <>
              {/* CONTINUE WATCHING SECTION */}
              {activeCategory === 'All' && !searchQuery && lastPlayed && (
                <div className="mb-6 bg-[#0a182b]/50 p-3 rounded-2xl border border-blue-400/5">
                  <h2 className="text-blue-200/80 text-[11px] font-bold mb-3 uppercase tracking-widest flex items-center gap-2">
                    <PlayCircle size={14} className="text-pink-500" /> Continue Watching
                  </h2>
                  <div className="w-[120px]">
                    <ChannelCard channel={lastPlayed} isActive={false} onClick={handleChannelSelect} />
                  </div>
                </div>
              )}

              {/* MAIN GRID */}
              <div className="grid grid-cols-4 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3">
                {filteredChannels.length > 0 ? (
                  filteredChannels.map((channel, idx) => (
                    <ChannelCard key={idx} channel={channel} isActive={activeChannel?.name === channel.name} onClick={handleChannelSelect} />
                  ))
                ) : (
                  <div className="col-span-full text-center py-10 text-blue-200/40 text-sm">No channels found.</div>
                )}
              </div>
            </>
          )}
        </div>
      </aside>

      {/* PLAYER UI */}
      <main className={`flex-col bg-[#020813] z-20 transition-all duration-0 ${activeChannel ? 'flex w-full h-[100dvh]' : 'hidden md:flex flex-1 h-[100dvh]'}`}>
        
        {activeChannel && (
          <div className="flex items-center justify-between p-3 bg-[#0a182b] border-b border-blue-400/10 shadow-lg z-30 flex-shrink-0 w-full">
            <div className="flex items-center gap-3">
              <button onClick={() => setActiveChannel(null)} className="flex items-center gap-2 text-pink-500 font-bold hover:text-pink-400 bg-blue-900/20 py-1.5 px-3 rounded-lg transition-colors">
                <ArrowLeft size={18} /> <span className="text-sm tracking-wider">BACK</span>
              </button>
              
              <div className="flex items-center gap-2">
                <div className="text-blue-50 text-sm md:text-base font-semibold truncate max-w-[150px] md:max-w-none">
                  {activeChannel.name}
                </div>
                {/* FAVORITES HEART BUTTON */}
                <button onClick={toggleFavorite} className="text-pink-500 hover:text-pink-400 p-1 transition-transform active:scale-75">
                  <Heart size={18} className={favorites.includes(activeChannel.name) ? "fill-pink-500" : "fill-none"} />
                </button>
              </div>
            </div>
          </div>
        )}

        <div className={`flex flex-col landscape:flex-row md:flex-row flex-1 overflow-hidden`}>
          
          <div className="w-full landscape:flex-1 md:flex-1 relative bg-black flex-shrink-0 flex items-center justify-center aspect-video landscape:aspect-auto md:aspect-auto shadow-2xl shadow-blue-900/20">
            {!activeChannel && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#020813] z-0">
                <PlayCircle size={70} className="text-blue-900/30 mb-4 drop-shadow-lg" />
                <p className="text-xl tracking-widest font-light text-blue-200/20">Select a channel to play</p>
              </div>
            )}
            
            {playerError && activeChannel && (
              <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm text-center p-6">
                <AlertTriangle size={50} className="text-red-500 mb-4 animate-pulse" />
                <h2 className="text-lg font-bold text-white mb-2">Stream Unavailable</h2>
                <p className="text-xs md:text-sm text-gray-400 max-w-sm mb-6">{playerError}</p>
                <button onClick={executePlayStream} className="flex items-center gap-2 px-6 py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full font-bold tracking-widest transition-colors text-white text-sm">
                  <RefreshCcw size={16} /> RETRY
                </button>
              </div>
            )}

            <div ref={containerRef} className={`w-full h-full absolute inset-0 z-10 ${!activeChannel ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              <video ref={videoRef} className="w-full h-full bg-black object-contain" autoPlay playsInline />
            </div>
          </div>

          {activeChannel && (
            <div className="w-full landscape:w-[280px] md:w-[320px] lg:w-[350px] flex-1 landscape:flex-none md:flex-none bg-[#0a182b] border-t landscape:border-t-0 landscape:border-l md:border-t-0 md:border-l border-blue-400/10 p-3 md:p-4 shadow-inner flex flex-col overflow-hidden">
              <h3 className="text-blue-200/60 text-[11px] md:text-sm font-bold mb-3 uppercase tracking-widest flex items-center gap-2 flex-shrink-0">
                <span className="w-2 h-2 rounded-full bg-pink-500 animate-pulse"></span> More in {activeChannel.category || 'Category'}
              </h3>
              
              <div className="flex flex-row landscape:hidden md:hidden overflow-x-auto gap-3 pb-2 scroll-smooth overscroll-none scrollbar-thin scrollbar-thumb-blue-500/30 scrollbar-track-transparent">
                {similarChannels.map((c, idx) => (
                  <div key={idx} className="flex-shrink-0 w-[90px]">
                    <ChannelCard channel={c} isActive={false} onClick={handleChannelSelect} />
                  </div>
                ))}
              </div>

              <div className="hidden landscape:grid md:grid grid-cols-2 gap-3 pb-2 overflow-y-auto scroll-smooth overscroll-none scrollbar-thin scrollbar-thumb-blue-500/30 scrollbar-track-transparent content-start pr-1">
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
