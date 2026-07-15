'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import 'shaka-player/dist/controls.css';
import { Search, Tv, PlayCircle, X, Loader2, ArrowLeft, WifiOff, AlertTriangle, RefreshCcw, Heart, Maximize, Minimize } from 'lucide-react';

// ==========================================
// INDEXED-DB LOGO CACHE MANAGER
// ==========================================
const DB_NAME = 'LogoCacheDB';
const STORE_NAME = 'logos';

const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const getCachedLogo = async (url) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(url);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (e) { return null; }
};

const setCachedLogo = async (url, blob) => {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, url);
  } catch (e) {}
};

// ==========================================
// OPTIMIZED CARD COMPONENT (With IDB Caching)
// ==========================================
const ChannelCard = React.memo(({ channel, isActive, onClick }) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [imgSrc, setImgSrc] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const loadImg = async () => {
      if (!channel.logo) return;
      try {
        const cachedBlob = await getCachedLogo(channel.logo);
        if (cachedBlob) {
          if (isMounted) setImgSrc(URL.createObjectURL(cachedBlob));
        } else {
          if (isMounted) setImgSrc(channel.logo);
          fetch(channel.logo)
            .then(r => r.blob())
            .then(blob => setCachedLogo(channel.logo, blob))
            .catch(() => {});
        }
      } catch (e) {
        if (isMounted) setImgSrc(channel.logo);
      }
    };
    loadImg();
    return () => { isMounted = false; };
  }, [channel.logo]);

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
      
      {imgSrc && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={imgSrc}
          alt="logo"
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          className={`w-full h-full object-contain pointer-events-none transition-opacity duration-500 
            ${loaded && !error ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
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
  
  // Persistent Auto Fit Zoom State
  const [isZoomed, setIsZoomed] = useState(false);

  // Core Refs - Preserved permanently to prevent DOM race conditions
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const uiRef = useRef(null);
  const tokenRef = useRef(""); 
  const activeChannelRef = useRef(null);
  const isManualAudioSwitch = useRef(false);

  // 1. Mount, Network, Configs, & Viewport Setup
  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== 'undefined') {
      setIsOffline(!navigator.onLine);
      window.addEventListener('online', () => setIsOffline(false));
      window.addEventListener('offline', () => setIsOffline(true));

      let viewportMeta = document.querySelector('meta[name="viewport"]');
      if (viewportMeta && !viewportMeta.content.includes("viewport-fit=cover")) {
        viewportMeta.content += ", viewport-fit=cover";
      } else if (!viewportMeta) {
        const meta = document.createElement('meta');
        meta.name = "viewport";
        meta.content = "width=device-width, initial-scale=1, viewport-fit=cover";
        document.head.appendChild(meta);
      }

      const storedFavs = JSON.parse(localStorage.getItem('fav_channels_8481') || '[]');
      setFavorites(storedFavs);
      
      const storedLast = JSON.parse(localStorage.getItem('last_played_8481') || 'null');
      setLastPlayed(storedLast);

      const storedZoom = localStorage.getItem('auto_fit_8481');
      if (storedZoom !== null) setIsZoomed(storedZoom === 'true');

      const handlePopState = () => {
        if (activeChannelRef.current) setActiveChannel(null);
      };
      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
    }
  }, []);

  // AUTOMATIC MOBILE PIP ON BACKGROUNDING
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden' && activeChannelRef.current && videoRef.current) {
        try {
          if (!videoRef.current.paused && document.pictureInPictureElement !== videoRef.current) {
            await videoRef.current.requestPictureInPicture();
          }
        } catch (error) {
          console.warn("Auto PiP ignored by browser", error);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
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
        const ts = new Date().getTime();

        const [tokenRes, standardRes, premRes, dictKeysRes, dictUrlsRes] = await Promise.allSettled([
          fetch('https://allinonereborn2.online/jstrweb2/cookies.json'),
          fetch(`https://jtvxweb.pages.dev/jstr4web.json?t=${ts}`),
          fetch(`https://sayan-json-3.pages.dev/Data/sports.json?t=${ts}`),
          fetch(`https://raw.githubusercontent.com/live4wap/links/refs/heads/main/jiomb?t=${ts}`),
          fetch(`https://tv.wapgotube.workers.dev/proxy/https://allinonereborn2.online/jtv-fetch/jstarcookie/cookie.json?t=${ts}`)
        ]);

        if (tokenRes.status === 'fulfilled') {
          try {
            const tokenData = await tokenRes.value.json();
            const extractedCookie = tokenData.find(item => item.cookie)?.cookie;
            if (extractedCookie) tokenRef.current = extractedCookie;
          } catch (e) { console.error("Token Fetch Error", e); }
        }

        const keysDict = new Map();
        if (dictKeysRes.status === 'fulfilled') {
          try {
            const d1Json = await dictKeysRes.value.json();
            const d1List = d1Json.channels || d1Json || [];
            if (Array.isArray(d1List)) {
              d1List.forEach(c => {
                const id = String(c.id || c.channel_id || "");
                const name = String(c.name || "").toLowerCase();
                const kId = c.keyId || c.key_id || c.clearkey_id;
                const k = c.key || c.clearkey_hex;
                if (kId && k && kId !== "null" && k !== "null") {
                  if (id) keysDict.set(id, { keyId: kId, key: k });
                  if (name) keysDict.set(name, { keyId: kId, key: k });
                }
              });
            }
          } catch (e) { console.error("Keys Dict Error", e); }
        }

        const urlsDict = new Map();
        if (dictUrlsRes.status === 'fulfilled') {
          try {
            const d2Json = await dictUrlsRes.value.json();
            const parseResults = (results, isFailed) => {
              if (Array.isArray(results)) {
                results.forEach(item => {
                  const id = String(item.channel_id || "");
                  const name = String(item.channel_name || "").toLowerCase();
                  const finalUrl = isFailed ? item.error_details?.final_url : item.result_details?.final_url;
                  if (finalUrl) {
                    if (id) urlsDict.set(id, finalUrl);
                    if (name) urlsDict.set(name, finalUrl);
                  }
                });
              }
            };
            if (d2Json) {
              parseResults(d2Json.failed_results, true);
              parseResults(d2Json.successful_results, false);
            }
          } catch (e) { console.error("URLs Dict Error", e); }
        }

        let standardData = [];
        if (standardRes.status === 'fulfilled') {
          try { standardData = await standardRes.value.json(); } 
          catch (e) { console.error("Standard Fetch Error", e); }
        }

        let premiumData = [];
        if (premRes.status === 'fulfilled') {
          try {
            const premJson = await premRes.value.json();
            if (premJson && premJson.channels) {
              premiumData = premJson.channels.map(c => {
                let logoName = c.id; 
                const match = c.stream_url?.match(/\/bpk-tv\/(.*?)\/WDVLive/i);
                if (match) logoName = match[1].replace(/_(BTS|MOB|xyz)$/i, '');
                return {
                  id: String(c.id || ""), name: c.name, url: c.stream_url, keyId: c.key_id, key: c.key, cookie: c.cookie,
                  category: 'Premium', logo: `https://jiotv.catchup.cdn.jio.com/dare_images/images/${logoName}.png`
                };
              });
            }
          } catch (e) { console.error("Premium Fetch Error", e); }
        }

        const customChannels = [
          { name: "Dangal", url: "https://live-dangal.akamaized.net/liveabr/pub-iodang10p4al/live_720p/chunks.m3u8", keyId: "null", key: "null", cookie: "", category: "Entertainment", logo: "https://dangaplay-json.s3.ap-south-1.amazonaws.com/Dangal_1x1.jpg?bf=0&f=jpg&p=true&q=85&w=300" },
          { name: "Dangal 2", url: "https://live-dangal2.akamaized.net/liveabr/pub-iodanga2a26kj2/live_720p/chunks.m3u8", keyId: "null", key: "null", cookie: "", category: "Entertainment", logo: "https://dangaplay-json.s3.ap-south-1.amazonaws.com/Dangal2_1x1.jpg?bf=0&f=jpg&p=true&q=85&w=50" },
          { name: "Bhojpuri Cinema", url: "https://live-bhojpuri.akamaized.net/liveabr/pub-iobhojpuqbu6yj/live_720p/chunks.m3u8", keyId: "null", key: "null", cookie: "", category: "Bhojpuri", logo: "https://dangaplay-json.s3.ap-south-1.amazonaws.com/BhojpuriCinema_1x1.jpg?bf=0&f=jpg&p=true&q=85&w=250" }
        ];

        const rawCombined = [...premiumData, ...customChannels, ...standardData];

        const combined = rawCombined.map(c => {
          const cid = String(c.id || c.channel_id || "");
          const cname = String(c.name || "").toLowerCase();
          
          if (c.stream_url && !c.url) c.url = c.stream_url;
          if (c.key_id && !c.keyId) c.keyId = c.key_id;

          const overrideUrl = urlsDict.get(cid) || urlsDict.get(cname);
          if (overrideUrl) c.url = overrideUrl;

          const needsKey = !c.keyId || c.keyId === "null" || c.keyId === "" || !c.key || c.key === "null" || c.key === "";
          if (needsKey) {
            const fixedKeys = keysDict.get(cid) || keysDict.get(cname);
            if (fixedKeys) {
              c.keyId = fixedKeys.keyId;
              c.key = fixedKeys.key;
            }
          }
          return c;
        });

        setChannels(combined);

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

  // 3. ONE-TIME SHAKA INITIALIZATION & DYNAMIC AUDIO HIJACKER
  useEffect(() => {
    if (!isMounted || isOffline || !videoRef.current || playerRef.current) return;

    const initPlayer = async () => {
      const shaka = await import('shaka-player/dist/shaka-player.ui');
      shaka.polyfill.installAll();

      if (!shaka.Player.isBrowserSupported()) return;

      const player = new shaka.Player(videoRef.current);
      const ui = new shaka.ui.Overlay(player, containerRef.current, videoRef.current);
      
      ui.configure({
        controlPanelElements: ['play_pause', 'time_and_duration', 'spacer', 'mute', 'volume', 'picture_in_picture', 'quality', 'fullscreen']
      });

      player.addEventListener('error', (e) => {
        console.error('Shaka Player Error', e.detail);
        setPlayerError("Stream unavailable or DRM error. Please try another channel.");
      });

      // SMART DYNAMIC AUDIO ADAPTATION (MEDIUM FOR 360p, HIGHEST FOR >360p)
      player.addEventListener('adaptation', () => {
        if (isManualAudioSwitch.current || !playerRef.current) return;
        
        const playerInstance = playerRef.current;
        const tracks = playerInstance.getVariantTracks();
        const active = tracks.find(t => t.active);
        
        if (!active || !active.height) return;

        const isLowRes = active.height <= 360;
        const peers = tracks.filter(t => t.height === active.height);
        
        if (peers.length <= 1) return;

        peers.sort((a,b) => (a.audioBandwidth || 0) - (b.audioBandwidth || 0));
        
        // Pick exact middle for Medium quality on low-res, Highest for High-res
        let targetTrack = isLowRes ? peers[Math.floor(peers.length / 2)] : peers[peers.length - 1];

        if (targetTrack && targetTrack.id !== active.id) {
            isManualAudioSwitch.current = true;
            playerInstance.selectVariantTrack(targetTrack, true, false); 
            
            setTimeout(() => {
                try {
                  if (playerRef.current) playerRef.current.configure({ abr: { enabled: true } });
                } catch(e) {}
                isManualAudioSwitch.current = false;
            }, 10000);
        }
      });

      player.getNetworkingEngine().registerRequestFilter((type, request) => {
        const isManifest = type === shaka.net.NetworkingEngine.RequestType.MANIFEST;
        const isSegment = type === shaka.net.NetworkingEngine.RequestType.SEGMENT;
        
        if (isManifest || isSegment) {
          const currentActiveChannel = activeChannelRef.current;
          if (!currentActiveChannel || !currentActiveChannel.url) return;
          
          let uri = request.uris[0];
          if (currentActiveChannel.url.includes('__hdnea__=')) {
              const tokenMatch = currentActiveChannel.url.match(/(__hdnea__=[^&]+)/);
              if (tokenMatch && !uri.includes('__hdnea__=')) {
                  const sep = uri.includes('?') ? '&' : '?';
                  request.uris[0] = uri + sep + tokenMatch[1];
              }
              return; 
          }

          const currentToken = currentActiveChannel.cookie ? currentActiveChannel.cookie : tokenRef.current;
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

  // 4. INSTANT PLAYBACK ENGINE (Executes on channel change without flushing UI)
  useEffect(() => {
    if (!playerRef.current) return;

    if (!activeChannel) {
      // Like New Session: Clears buffer and network instantly when Back is pressed
      playerRef.current.unload();
      setPlayerError(null);
      return;
    }

    const loadStream = async () => {
      try {
        setPlayerError(null);
        let drmConfig = { clearKeys: {} };
        
        if (activeChannel.keyId && activeChannel.key && activeChannel.keyId !== "null" && activeChannel.key !== "null") {
          drmConfig.clearKeys[activeChannel.keyId] = activeChannel.key;
        }

        playerRef.current.configure({
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

        // Direct Load instantly switches streams without UI tearing/flushes
        if (forceMimeType) await playerRef.current.load(finalUrl, null, forceMimeType);
        else await playerRef.current.load(finalUrl);

        if ('mediaSession' in navigator) {
          navigator.mediaSession.metadata = new window.MediaMetadata({
            title: activeChannel.name,
            artist: 'Ayush@8481', 
            artwork: [{ src: activeChannel.logo, sizes: '512x512' }]
          });
        }
      } catch (error) {
        if (error && error.code !== 7000) { // Code 7000 is Load Interrupted (Safe to ignore on rapid clicks)
          console.error("Playback error:", error);
          setPlayerError("Failed to fetch stream data. Ensure your connection is stable.");
        }
      }
    };

    loadStream();
  }, [activeChannel]);

  // Handle Selection & Push State
  const handleChannelSelect = useCallback((channel) => {
    if (!activeChannelRef.current && typeof window !== 'undefined') {
      window.history.pushState({ playerOpen: true }, '');
    } else if (typeof window !== 'undefined') {
      window.history.replaceState({ playerOpen: true }, '');
    }
    setActiveChannel(channel);
    setSearchQuery('');
    setLastPlayed(channel);
    localStorage.setItem('last_played_8481', JSON.stringify(channel));
  }, []);

  const handleUiBack = () => {
    if (window.history.state && window.history.state.playerOpen) {
      window.history.back();
    } else {
      setActiveChannel(null);
    }
  };

  const toggleAutoFit = () => {
    const nextState = !isZoomed;
    setIsZoomed(nextState);
    localStorage.setItem('auto_fit_8481', String(nextState));
    document.cookie = `auto_fit_8481=${nextState}; path=/; max-age=31536000`;
  };

  const toggleFavorite = () => {
    if (!activeChannel) return;
    const isFav = favorites.includes(activeChannel.name);
    let newFavs;
    if (isFav) newFavs = favorites.filter(name => name !== activeChannel.name);
    else newFavs = [...favorites, activeChannel.name];
    setFavorites(newFavs);
    localStorage.setItem('fav_channels_8481', JSON.stringify(newFavs));
  };

  const filteredChannels = useMemo(() => {
    return channels.filter(c => {
      const matchSearch = c.name?.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchSearch) return false;
      const cCat = c.category || c.group || c.group_title || 'Others';
      if (activeCategory === 'All') return true;
      if (activeCategory === 'Favorites') return favorites.includes(c.name);
      if (activeCategory === 'Sports') return cCat === 'Sports' || (cCat === 'Premium' && /sport/i.test(c.name));
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

  if (!isMounted) return <div className="h-screen w-screen bg-[#020813]" />;

  if (isOffline) {
    return (
      <div className="flex flex-col items-center justify-center h-[100dvh] w-full bg-[#020813] text-white">
        <WifiOff size={70} className="text-pink-500 mb-6 drop-shadow-[0_0_15px_rgba(236,72,153,0.5)] animate-pulse" />
        <h1 className="text-2xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-indigo-400 mb-2">NO INTERNET</h1>
        <p className="text-blue-200/50 text-sm mb-8 text-center max-w-[250px] leading-relaxed">Please check your network connection and try again.</p>
        <button onClick={() => { if(navigator.onLine) setIsOffline(false); }} className="flex items-center gap-2 px-8 py-3 bg-blue-900/20 hover:bg-blue-900/40 border border-blue-400/20 rounded-full font-bold tracking-widest transition-colors"><RefreshCcw size={18} /> RETRY</button>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] w-full bg-[#020813] text-white font-sans overflow-hidden selection:bg-pink-500/30">
      
      {/* BULLETPROOF FULLSCREEN NOTCH PROTECTOR CSS */}
      <style dangerouslySetInnerHTML={{ __html: `
        /* Ensures controls dodge punch-holes natively via environment safe-areas */
        .shaka-video-container:fullscreen .shaka-controls-container,
        .shaka-video-container:-webkit-full-screen .shaka-controls-container {
          padding-left: env(safe-area-inset-left, 20px) !important;
          padding-right: env(safe-area-inset-right, 20px) !important;
          padding-bottom: env(safe-area-inset-bottom, 15px) !important;
          padding-top: env(safe-area-inset-top, 15px) !important;
          box-sizing: border-box !important;
        }
        
        /* Video stays completely centered, cutting edges instead of faces */
        video.object-cover {
          object-position: center center !important;
        }
      `}} />

      {/* SIDEBAR */}
      <aside className={`flex flex-col bg-[#061121] border-r border-blue-400/10 z-10 ${activeChannel ? 'hidden' : 'flex-1 w-full md:w-[400px] lg:w-[450px] md:flex-none'}`}>
        <div className="p-4 flex flex-shrink-0 items-center justify-between border-b border-blue-400/10 bg-[#0a182b]">
          <div className="flex items-center gap-2 text-pink-500">
            <Tv size={24} className="drop-shadow-[0_0_5px_rgba(236,72,153,0.5)]" />
            <h1 className="text-lg md:text-xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-indigo-400">Live@8481</h1>
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
                  activeCategory === cat ? 'bg-gradient-to-r from-pink-600 to-indigo-600 text-white shadow-md' 
                  : cat === 'Favorites' ? 'bg-pink-500/10 text-pink-400 hover:bg-pink-500/20 border border-pink-500/20'
                  : cat === 'Premium' ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20' 
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
              <p className="tracking-widest text-xs font-semibold uppercase">Connecting to Live8481</p>
            </div>
          ) : (
            <>
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
              <button onClick={handleUiBack} className="flex items-center gap-2 text-pink-500 font-bold hover:text-pink-400 bg-blue-900/20 py-1.5 px-3 rounded-lg transition-colors">
                <ArrowLeft size={18} /> <span className="text-sm tracking-wider">BACK</span>
              </button>
              <div className="flex items-center gap-2">
                <div className="text-blue-50 text-sm md:text-base font-semibold truncate max-w-[150px] md:max-w-none">{activeChannel.name}</div>
                <button onClick={toggleFavorite} className="text-pink-500 hover:text-pink-400 p-1 transition-transform active:scale-75">
                  <Heart size={18} className={favorites.includes(activeChannel.name) ? "fill-pink-500" : "fill-none"} />
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col landscape:flex-row md:flex-row flex-1 overflow-hidden">
          
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
                <button onClick={() => {
                    const temp = activeChannel;
                    setActiveChannel(null); 
                    setTimeout(() => setActiveChannel(temp), 50);
                  }} 
                  className="flex items-center gap-2 px-6 py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full font-bold tracking-widest transition-colors text-white text-sm"
                >
                  <RefreshCcw size={16} /> RETRY
                </button>
              </div>
            )}
            
            <div ref={containerRef} className={`w-full h-full absolute inset-0 z-10 ${!activeChannel ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              <video 
                ref={videoRef} 
                className={`w-full h-full bg-black transition-all duration-300 ease-in-out ${isZoomed ? 'object-cover' : 'object-contain'}`} 
                autoPlay 
                playsInline
                autoPictureInPicture={true}
              />
            </div>
          </div>

          {activeChannel && (
            <div className="w-full landscape:w-[280px] md:w-[320px] lg:w-[350px] flex-1 landscape:flex-none md:flex-none bg-[#0a182b] border-t landscape:border-t-0 landscape:border-l md:border-t-0 md:border-l border-blue-400/10 p-3 md:p-4 shadow-inner flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <h3 className="text-blue-200/60 text-[11px] md:text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-pink-500 animate-pulse"></span> More in {activeChannel.category || 'Category'}
                </h3>
                
                <button 
                  onClick={toggleAutoFit}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] md:text-xs font-bold transition-colors border shadow-sm ${
                    isZoomed ? 'bg-pink-500/20 text-pink-400 border-pink-500/50 hover:bg-pink-500/30' : 'bg-blue-900/40 text-blue-300 border-blue-400/20 hover:bg-blue-900/60'
                  }`}
                  title="Toggle Full Screen Auto-Fit"
                >
                  {isZoomed ? <Minimize size={12} /> : <Maximize size={12} />}
                  AUTO FIT: {isZoomed ? 'ON' : 'OFF'}
                </button>
              </div>
              
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
