'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
          fetch(channel.logo).then(r => r.blob()).then(blob => setCachedLogo(channel.logo, blob)).catch(() => {});
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
      className={`relative w-full aspect-square bg-[#0a182b] rounded-xl p-2 md:p-3 flex items-center justify-center 
        transition-all duration-300 ease-in-out hover:scale-105 active:scale-95
        ${isActive ? 'ring-4 ring-[#0084ff] scale-105 shadow-[0_0_15px_rgba(0,132,255,0.5)] bg-white' : 'border border-blue-900/20 shadow-sm bg-white/5'}`}
    >
      {(!loaded || error) && (
        <div className="absolute inset-0 flex items-center justify-center p-2">
          <span className="text-[10px] md:text-xs font-bold text-gray-400 text-center uppercase tracking-wider leading-tight">{channel.name}</span>
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
          className={`w-full h-full object-contain pointer-events-none transition-opacity duration-500 ${loaded && !error ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </button>
  );
});
ChannelCard.displayName = "ChannelCard";

// ==========================================
// DYNAMIC M3U8 MASTER GENERATOR
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

const CATEGORY_ORDER = ['All', 'Premium', 'Favorites', 'Sports', 'Entertainment', 'News', 'Movies', 'Music', 'Kids', 'Bhojpuri'];

// Format time utility
const formatDuration = (seconds) => {
  if (isNaN(seconds) || seconds === Infinity) return 'LIVE';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export default function PerfectPlayerUI() {
  // Core States
  const [isMounted, setIsMounted] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [playerError, setPlayerError] = useState(null);

  // Data States
  const [channels, setChannels] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [favorites, setFavorites] = useState([]);
  const [lastPlayed, setLastPlayed] = useState(null);

  // UI States
  const [activeChannel, setActiveChannel] = useState(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  // Custom Player States (MoviePlayerClient UI)
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [quality, setQuality] = useState('Auto');
  const [availableQualities, setAvailableQualities] = useState([{ index: -1, name: 'Auto' }]);
  const [showPlayerSettings, setShowPlayerSettings] = useState(false);
  
  // Skip Animations
  const [skipAccumulator, setSkipAccumulator] = useState(0);
  const [skipSide, setSkipSide] = useState(null);

  // Refs
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const tokenRef = useRef(""); 
  const activeChannelRef = useRef(null);
  const isManualAudioSwitch = useRef(false);
  const controlsTimeoutRef = useRef(null);
  const skipTimeoutRef = useRef(null);
  const currentSkipSide = useRef(null);

  // 1. Mount & Setup
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

      setFavorites(JSON.parse(localStorage.getItem('fav_channels_8481') || '[]'));
      setLastPlayed(JSON.parse(localStorage.getItem('last_played_8481') || 'null'));
      const storedZoom = localStorage.getItem('auto_fit_8481');
      if (storedZoom !== null) setIsZoomed(storedZoom === 'true');

      const handlePopState = () => { if (activeChannelRef.current) setActiveChannel(null); };
      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
    }
  }, []);

  // Click Outside Menus
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.keep-menus-open')) {
        setShowPlayerSettings(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Fullscreen Listener
  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Auto PiP on background
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden' && activeChannelRef.current && videoRef.current) {
        try {
          if (!videoRef.current.paused && document.pictureInPictureElement !== videoRef.current) {
            await videoRef.current.requestPictureInPicture();
          }
        } catch (error) {}
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => { activeChannelRef.current = activeChannel; }, [activeChannel]);

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
            const extCookie = tokenData.find(item => item.cookie)?.cookie;
            if (extCookie) tokenRef.current = extCookie;
          } catch (e) {}
        }

        const keysDict = new Map();
        if (dictKeysRes.status === 'fulfilled') {
          try {
            const d1Json = await dictKeysRes.value.json();
            (Array.isArray(d1Json.channels || d1Json) ? (d1Json.channels || d1Json) : []).forEach(c => {
              const id = String(c.id || c.channel_id || "");
              const name = String(c.name || "").toLowerCase();
              const kId = c.keyId || c.key_id || c.clearkey_id;
              const k = c.key || c.clearkey_hex;
              if (kId && k && kId !== "null" && k !== "null") {
                if (id) keysDict.set(id, { keyId: kId, key: k });
                if (name) keysDict.set(name, { keyId: kId, key: k });
              }
            });
          } catch (e) {}
        }

        const urlsDict = new Map();
        if (dictUrlsRes.status === 'fulfilled') {
          try {
            const d2Json = await dictUrlsRes.value.json();
            const parse = (res, isFailed) => {
              (Array.isArray(res) ? res : []).forEach(item => {
                const id = String(item.channel_id || "");
                const name = String(item.channel_name || "").toLowerCase();
                const fUrl = isFailed ? item.error_details?.final_url : item.result_details?.final_url;
                if (fUrl) { if (id) urlsDict.set(id, fUrl); if (name) urlsDict.set(name, fUrl); }
              });
            };
            if (d2Json) { parse(d2Json.failed_results, true); parse(d2Json.successful_results, false); }
          } catch (e) {}
        }

        let standardData = [];
        if (standardRes.status === 'fulfilled') { try { standardData = await standardRes.value.json(); } catch (e) {} }

        let premiumData = [];
        if (premRes.status === 'fulfilled') {
          try {
            const premJson = await premRes.value.json();
            if (premJson && premJson.channels) {
              premiumData = premJson.channels.map(c => {
                let logoName = c.id; 
                const match = c.stream_url?.match(/\/bpk-tv\/(.*?)\/WDVLive/i);
                if (match) logoName = match[1].replace(/_(BTS|MOB|xyz)$/i, '');
                return { id: String(c.id || ""), name: c.name, url: c.stream_url, keyId: c.key_id, key: c.key, cookie: c.cookie, category: 'Premium', logo: `https://jiotv.catchup.cdn.jio.com/dare_images/images/${logoName}.png` };
              });
            }
          } catch (e) {}
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
            if (fixedKeys) { c.keyId = fixedKeys.keyId; c.key = fixedKeys.key; }
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
      } catch (error) { setIsLoading(false); }
    };
    fetchInitialData();
  }, [isMounted, isOffline]);

  // 3. SHAKA BARE-METAL CORE INITIALIZATION (NO DEFAULT UI)
  useEffect(() => {
    if (!isMounted || isOffline || !videoRef.current || playerRef.current) return;

    const initPlayer = async () => {
      const shaka = await import('shaka-player'); // ONLY CORE, NO UI
      shaka.polyfill.installAll();
      if (!shaka.Player.isBrowserSupported()) return;

      const player = new shaka.Player(videoRef.current);
      
      player.addEventListener('error', (e) => {
        console.error('Shaka Player Error', e.detail);
        setPlayerError("Stream unavailable or DRM error. Please try another channel.");
      });

      // Populate Qualities for Custom Settings Menu
      player.addEventListener('trackschanged', () => {
        const tracks = player.getVariantTracks();
        const unique = new Map();
        tracks.forEach(t => { if (t.height && !unique.has(t.height)) unique.set(t.height, t); });
        const sorted = Array.from(unique.values()).sort((a, b) => b.height - a.height);
        setAvailableQualities([{ index: -1, name: 'Auto' }, ...sorted.map(t => ({ index: t.id, name: `${t.height}p`, track: t }))]);
      });

      // ALWAYS HIGHEST AUDIO QUALITY HIJACKER
      player.addEventListener('adaptation', () => {
        if (isManualAudioSwitch.current || !playerRef.current) return;
        const tracks = playerRef.current.getVariantTracks();
        const active = tracks.find(t => t.active);
        if (!active || !active.height) return;
        const peers = tracks.filter(t => t.height === active.height);
        if (peers.length <= 1) return;
        peers.sort((a,b) => (a.audioBandwidth || 0) - (b.audioBandwidth || 0));
        let targetTrack = peers[peers.length - 1]; // ALWAYS Highest for the active resolution

        if (targetTrack && targetTrack.id !== active.id) {
            isManualAudioSwitch.current = true;
            playerRef.current.selectVariantTrack(targetTrack, false); // false = clearBuffer disabled = no freeze
            setTimeout(() => {
                if (playerRef.current) playerRef.current.configure({ abr: { enabled: true } });
                isManualAudioSwitch.current = false;
            }, 10000);
        }
      });

      player.getNetworkingEngine().registerRequestFilter((type, request) => {
        const isManifest = type === shaka.net.NetworkingEngine.RequestType.MANIFEST;
        const isSegment = type === shaka.net.NetworkingEngine.RequestType.SEGMENT;
        if (isManifest || isSegment) {
          const currentCh = activeChannelRef.current;
          if (!currentCh || !currentCh.url) return;
          let uri = request.uris[0];
          if (currentCh.url.includes('__hdnea__=')) {
              const tokenMatch = currentCh.url.match(/(__hdnea__=[^&]+)/);
              if (tokenMatch && !uri.includes('__hdnea__=')) {
                  request.uris[0] = uri + (uri.includes('?') ? '&' : '?') + tokenMatch[1];
              }
              return; 
          }
          const currentToken = currentCh.cookie ? currentCh.cookie : tokenRef.current;
          if (currentToken && uri.includes('.jio.com') && !uri.includes('st=') && !uri.includes('hdnea')) {
             const cleanToken = currentToken.startsWith('?') ? currentToken.substring(1) : currentToken;
             request.uris[0] = uri + (uri.includes('?') ? '&' : '?') + cleanToken;
          }
        }
      });

      playerRef.current = player;
    };
    initPlayer();
    return () => { if (playerRef.current) playerRef.current.destroy(); };
  }, [isMounted, isOffline]);

  // 4. INSTANT PLAYBACK ENGINE
  useEffect(() => {
    if (!playerRef.current) return;
    if (!activeChannel) {
      playerRef.current.unload();
      setPlayerError(null);
      setIsPlaying(false);
      return;
    }
    const loadStream = async () => {
      try {
        setPlayerError(null);
        setIsBuffering(true);
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

        if (forceMimeType) await playerRef.current.load(finalUrl, null, forceMimeType);
        else await playerRef.current.load(finalUrl);

        if ('mediaSession' in navigator) {
          navigator.mediaSession.metadata = new window.MediaMetadata({
            title: activeChannel.name,
            artist: 'Live TV', 
            artwork: [{ src: activeChannel.logo, sizes: '512x512' }]
          });
        }
      } catch (error) {
        if (error && error.code !== 7000) {
          setPlayerError("Failed to fetch stream data. Ensure your connection is stable.");
        }
      }
    };
    loadStream();
  }, [activeChannel]);

  // Handle Playback UI Events
  const resetControlsTimer = () => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying) controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3500);
  };

  useEffect(() => {
    if (!isPlaying) {
      setShowControls(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    } else resetControlsTimer();
    return () => clearTimeout(controlsTimeoutRef.current);
  }, [isPlaying]);

  useEffect(() => {
    if (!showControls) setShowPlayerSettings(false);
  }, [showControls]);

  const handleMouseMove = (e) => {
    if (e.movementX === 0 && e.movementY === 0) return;
    if (!showControls) setShowControls(true);
    resetControlsTimer();
  };

  const togglePlay = (e) => {
    if (e) e.stopPropagation();
    if (!videoRef.current) return;
    if (videoRef.current.paused) videoRef.current.play().catch(() => {});
    else videoRef.current.pause();
  };

  const handleButtonSkip = (isLeft, e) => {
    e.stopPropagation();
    const side = isLeft ? 'left' : 'right';
    const increment = isLeft ? -10 : 10;
    if (currentSkipSide.current === side) setSkipAccumulator(prev => prev + increment);
    else {
      currentSkipSide.current = side;
      setSkipSide(side);
      setSkipAccumulator(increment);
    }
    if (videoRef.current) {
      const newTime = Math.max(0, videoRef.current.currentTime + increment);
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
    if (skipTimeoutRef.current) clearTimeout(skipTimeoutRef.current);
    skipTimeoutRef.current = setTimeout(() => {
      currentSkipSide.current = null;
      setSkipSide(null);
      setSkipAccumulator(0);
    }, 800);
  };

  const handleInteraction = () => {
    setShowPlayerSettings(false);
    setShowControls(prev => !prev);
    if (isPlaying && !showControls) resetControlsTimer();
  };

  const toggleFullscreen = (e) => {
    e.stopPropagation();
    if (!containerRef.current) return;
    if (!document.fullscreenElement) containerRef.current.requestFullscreen().catch(() => {});
    else document.exitFullscreen();
  };

  const togglePictureInPicture = async (e) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await videoRef.current.requestPictureInPicture();
    } catch (err) {}
  };

  const selectQuality = (item) => {
    if (!playerRef.current) return;
    if (item.index === -1) {
      playerRef.current.configure({ abr: { enabled: true } });
      setQuality('Auto');
    } else {
      playerRef.current.configure({ abr: { enabled: false } });
      playerRef.current.selectVariantTrack(item.track, true, false);
      setQuality(item.name);
    }
    setShowPlayerSettings(false);
  };

  const handleSeekChange = (e) => {
    const nextTime = parseFloat(e.target.value);
    setCurrentTime(nextTime);
    if (videoRef.current) videoRef.current.currentTime = nextTime;
  };

  const handleChannelSelect = useCallback((channel) => {
    if (!activeChannelRef.current && typeof window !== 'undefined') window.history.pushState({ playerOpen: true }, '');
    else if (typeof window !== 'undefined') window.history.replaceState({ playerOpen: true }, '');
    setActiveChannel(channel);
    setSearchQuery('');
    setLastPlayed(channel);
    localStorage.setItem('last_played_8481', JSON.stringify(channel));
  }, []);

  const handleUiBack = () => {
    if (window.history.state && window.history.state.playerOpen) window.history.back();
    else setActiveChannel(null);
  };

  const toggleAutoFit = () => {
    const nextState = !isZoomed;
    setIsZoomed(nextState);
    localStorage.setItem('auto_fit_8481', String(nextState));
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
      if (!c.name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      const cCat = c.category || c.group || c.group_title || 'Others';
      if (activeCategory === 'All') return true;
      if (activeCategory === 'Favorites') return favorites.includes(c.name);
      if (activeCategory === 'Sports') return cCat === 'Sports' || (cCat === 'Premium' && /sport/i.test(c.name));
      return cCat === activeCategory;
    });
  }, [channels, activeCategory, searchQuery, favorites]);

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

  const totalDuration = duration || 100;
  const progressPercent = totalDuration > 0 && totalDuration !== Infinity ? (currentTime / totalDuration) * 100 : 0;
  const rangeBackground = `linear-gradient(to right, #0084ff 0%, #0084ff ${progressPercent}%, rgba(255,255,255,0.3) ${progressPercent}%, rgba(255,255,255,0.3) 100%)`;
  const pointerEventsClass = showControls ? 'pointer-events-auto' : 'pointer-events-none';

  return (
    <div className="flex h-[100dvh] w-full bg-[#070b13] text-white font-sans overflow-hidden selection:bg-[#0084ff]/30">
      
      {/* CUSTOM CSS FROM MOVIEPLAYERCLIENT */}
      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        input[type="range"] { background: transparent; }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #0084ff; cursor: pointer; border: none; transition: transform 0.1s ease; }
        input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.3); }
        input[type="range"]::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: #0084ff; cursor: pointer; border: none; transition: transform 0.1s ease; }
        input[type="range"]::-moz-range-thumb:hover { transform: scale(1.3); }
        @keyframes fadeSlideRight { 0% { opacity: 0.2; transform: translateX(-2px); } 50% { opacity: 1; transform: translateX(2px); } 100% { opacity: 0.2; transform: translateX(-2px); } }
        @keyframes fadeSlideLeft { 0% { opacity: 0.2; transform: translateX(2px); } 50% { opacity: 1; transform: translateX(-2px); } 100% { opacity: 0.2; transform: translateX(2px); } }
        .anim-arr-r { animation: fadeSlideRight 0.6s ease-in-out infinite; }
        .anim-arr-l { animation: fadeSlideLeft 0.6s ease-in-out infinite; }
        .dly-1 { animation-delay: 0.1s; }
        .dly-2 { animation-delay: 0.2s; }
      `}} />

      {/* SIDEBAR */}
      <aside className={`flex flex-col bg-[#061121] border-r border-blue-400/10 z-10 ${activeChannel ? 'hidden' : 'flex-1 w-full md:w-[400px] lg:w-[450px] md:flex-none'}`}>
        <div className="p-4 flex flex-shrink-0 items-center justify-between border-b border-blue-400/10 bg-[#0a182b]">
          <div className="flex items-center gap-2 text-[#0084ff]">
            <Tv size={24} className="drop-shadow-[0_0_5px_rgba(0,132,255,0.5)]" />
            <h1 className="text-lg md:text-xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-[#0084ff] to-indigo-400">Live@8481</h1>
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
                className="w-full bg-[#11223d] border border-blue-400/20 rounded-lg py-2.5 pl-9 pr-4 text-sm text-white focus:outline-none focus:border-[#0084ff] transition-colors"
              />
            </div>
          </div>
        )}

        <div className="p-3 border-b border-blue-400/10 bg-[#061121] flex-shrink-0">
          <div className="flex overflow-x-auto gap-2 pb-2 no-scrollbar scroll-smooth overscroll-none">
            {categories.map((cat) => (
              <button key={cat} onClick={() => setActiveCategory(cat)}
                className={`whitespace-nowrap flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[13px] font-bold tracking-wider transition-colors duration-200 ${
                  activeCategory === cat ? 'bg-[#0084ff] text-white shadow-md' 
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

        <div className="flex-1 overflow-y-auto no-scrollbar scroll-smooth overscroll-none p-3 md:p-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-blue-400/50">
              <Loader2 className="animate-spin text-[#0084ff]" size={36} />
              <p className="tracking-widest text-xs font-semibold uppercase">Connecting to Live8481</p>
            </div>
          ) : (
            <>
              {activeCategory === 'All' && !searchQuery && lastPlayed && (
                <div className="mb-6 bg-[#0a182b]/50 p-3 rounded-2xl border border-blue-400/5">
                  <h2 className="text-blue-200/80 text-[11px] font-bold mb-3 uppercase tracking-widest flex items-center gap-2">
                    <PlayCircle size={14} className="text-[#0084ff]" /> Continue Watching
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

      {/* CUSTOM REACT PLAYER UI (REPLACES SHAKA UI) */}
      <main className={`flex-col bg-black z-20 transition-all duration-0 ${activeChannel ? 'flex w-full h-[100dvh]' : 'hidden md:flex flex-1 h-[100dvh]'}`}>
        <div className="w-full h-full relative flex items-center justify-center aspect-video landscape:aspect-auto md:aspect-auto bg-black overflow-hidden group">
          
          {!activeChannel && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#070b13] z-0">
              <PlayCircle size={70} className="text-blue-900/30 mb-4 drop-shadow-lg" />
              <p className="text-xl tracking-widest font-light text-blue-200/20">Select a channel to play</p>
            </div>
          )}

          {playerError && activeChannel && (
            <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm text-center p-6">
              <AlertTriangle size={50} className="text-red-500 mb-4 animate-pulse" />
              <h2 className="text-lg font-bold text-white mb-2">Stream Unavailable</h2>
              <p className="text-xs md:text-sm text-gray-400 max-w-sm mb-6">{playerError}</p>
              <button onClick={() => { const temp = activeChannel; setActiveChannel(null); setTimeout(() => setActiveChannel(temp), 50); }} className="flex items-center gap-2 px-6 py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full font-bold tracking-widest transition-colors text-white text-sm"><RefreshCcw size={16} /> RETRY</button>
            </div>
          )}

          <div ref={containerRef} onMouseMove={handleMouseMove} className={`absolute inset-0 w-full h-full z-10 ${!activeChannel ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            <video 
              ref={videoRef} 
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onDurationChange={(e) => setDuration(e.currentTarget.duration)}
              onPlaying={() => { setIsBuffering(false); setIsPlaying(true); }}
              onPause={() => setIsPlaying(false)}
              onWaiting={() => setIsBuffering(true)}
              onSeeking={() => setIsBuffering(true)}
              onSeeked={() => setIsBuffering(false)}
              onStalled={() => setIsBuffering(true)}
              className={`w-full h-full transition-all duration-300 ease-in-out ${isZoomed ? 'object-cover' : 'object-contain'}`} 
              playsInline
              autoPictureInPicture={true}
            />

            {/* INTERACTION SHIELD */}
            <div onClick={handleInteraction} className="absolute inset-0 z-10 cursor-pointer" />

            {/* SKIP ANIMATIONS */}
            <div className={`absolute left-0 top-0 bottom-0 w-[30%] bg-white/10 flex flex-col justify-center items-center pointer-events-none z-20 transition-opacity duration-200 ${skipSide === 'left' ? 'opacity-100' : 'opacity-0'}`}>
              <div className="flex text-white drop-shadow-lg">
                <svg className="w-9 h-9 anim-arr-l" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                <svg className="w-9 h-9 anim-arr-l dly-1 -ml-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                <svg className="w-9 h-9 anim-arr-l dly-2 -ml-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              </div>
              <span className="text-white text-sm font-bold mt-2 drop-shadow-md">-{Math.abs(skipAccumulator)}s</span>
            </div>
            <div className={`absolute right-0 top-0 bottom-0 w-[30%] bg-white/10 flex flex-col justify-center items-center pointer-events-none z-20 transition-opacity duration-200 ${skipSide === 'right' ? 'opacity-100' : 'opacity-0'}`}>
              <div className="flex text-white drop-shadow-lg">
                <svg className="w-9 h-9 anim-arr-r dly-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                <svg className="w-9 h-9 anim-arr-r dly-1 -ml-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                <svg className="w-9 h-9 anim-arr-r -ml-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </div>
              <span className="text-white text-sm font-bold mt-2 drop-shadow-md">+{Math.abs(skipAccumulator)}s</span>
            </div>

            {/* BUFFERING SPINNER */}
            <div className={`absolute inset-0 flex items-center justify-center bg-black/40 z-20 pointer-events-none transition-opacity duration-300 ${isBuffering ? 'opacity-100' : 'opacity-0'}`}>
              <div className="w-12 h-12 md:w-16 md:h-16 border-[3px] border-[#0084ff]/30 border-t-[#0084ff] rounded-full animate-spin"></div>
            </div>

            {/* CONTROLS OVERLAY */}
            <div className={`absolute inset-0 flex flex-col justify-between p-4 md:p-6 z-30 transition-opacity duration-300 pointer-events-none ${showControls ? 'opacity-100 bg-black/50' : 'opacity-0'}`}
                 style={{ paddingTop: 'env(safe-area-inset-top, 16px)', paddingBottom: 'env(safe-area-inset-bottom, 16px)', paddingLeft: 'env(safe-area-inset-left, 16px)', paddingRight: 'env(safe-area-inset-right, 16px)' }}>
              
              {/* Top Bar */}
              <div className={`flex items-center justify-between ${pointerEventsClass} w-full`}>
                <div className="flex items-center gap-3">
                  <button onClick={handleUiBack} className="p-1 hover:text-[#0084ff] transition active:scale-95 drop-shadow-md">
                    <ArrowLeft size={24} className="text-white" />
                  </button>
                  <div className="text-white text-sm md:text-base font-bold truncate max-w-[150px] md:max-w-xs">{activeChannel?.name}</div>
                  <button onClick={toggleFavorite} className="text-pink-500 hover:text-pink-400 p-1 transition-transform active:scale-75">
                    <Heart size={20} className={activeChannel && favorites.includes(activeChannel.name) ? "fill-pink-500" : "fill-none"} />
                  </button>
                </div>
                <button onClick={toggleAutoFit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] md:text-xs font-bold transition-colors border shadow-md bg-white/10 text-white hover:bg-[#0084ff]/80 border-white/20 backdrop-blur-sm">
                  {isZoomed ? <Minimize size={14} /> : <Maximize size={14} />} AUTO FIT: {isZoomed ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Center Controls */}
              <div className={`flex items-center justify-center gap-14 sm:gap-20 md:gap-24 ${pointerEventsClass}`}>
                <button onClick={(e) => handleButtonSkip(true, e)} className="focus:outline-none transition-transform hover:scale-105 active:scale-90 flex items-center drop-shadow-md">
                  <svg className="w-10 h-10 sm:w-12 sm:h-12 text-white hover:text-[#0084ff] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
                </button>
                <div className="w-12 h-12 md:w-16 md:h-16 flex items-center justify-center drop-shadow-md">
                  {!isBuffering && (
                    <button onClick={togglePlay} className="transition-transform hover:scale-110 active:scale-95 focus:outline-none">
                      {isPlaying ? (
                        <svg className="w-10 h-10 md:w-12 md:h-12 text-white fill-white" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                      ) : (
                        <svg className="w-10 h-10 md:w-12 md:h-12 text-white fill-white translate-x-1" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      )}
                    </button>
                  )}
                </div>
                <button onClick={(e) => handleButtonSkip(false, e)} className="focus:outline-none transition-transform hover:scale-105 active:scale-90 flex items-center drop-shadow-md">
                  <svg className="w-10 h-10 sm:w-12 sm:h-12 text-white hover:text-[#0084ff] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                </button>
              </div>

              {/* Bottom Bar */}
              <div className={`flex flex-col gap-2 ${pointerEventsClass} pb-[10px]`}>
                <div className="flex items-center justify-between text-sm text-gray-100 drop-shadow-md mb-2">
                  <div className="flex items-center font-normal tracking-wide text-sm text-[#e2e8f0]">
                    <span>{formatDuration(currentTime)}</span><span className="mx-1.5">/</span><span>{formatDuration(duration)}</span>
                  </div>

                  <div className="flex items-center gap-4 keep-menus-open">
                    <button onClick={togglePictureInPicture} className="p-1.5 text-white hover:text-[#0084ff] transition">
                      <svg className="w-6 h-6 drop-shadow-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" /><rect x="13" y="11" width="7" height="5" rx="1" fill="currentColor" stroke="none" /></svg>
                    </button>

                    <button onClick={(e) => { e.stopPropagation(); setShowPlayerSettings(!showPlayerSettings); }} className="p-1.5 hover:text-[#0084ff] transition">
                      <svg className={`w-6 h-6 text-white drop-shadow-md transition-transform duration-300 hover:rotate-45 ${showPlayerSettings ? 'rotate-45' : ''}`} viewBox="0 0 24 24" fill="currentColor">
                         <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/>
                      </svg>
                    </button>

                    <button onClick={toggleFullscreen} className="p-1.5 hover:text-[#0084ff] transition drop-shadow-md">
                      {isFullscreen ? (
                        <svg className="w-6 h-6 text-white" viewBox="0 0 24 24"><path fill="currentColor" d="M18 7h-2V5h-2v4h4V7zM6 7v2h4V5H8v2H6zm12 10v-2h-4v4h2v-2h2zM6 17h2v2h2v-4H6v2z"/></svg>
                      ) : (
                        <svg className="w-6 h-6 text-white" viewBox="0 0 24 24"><path fill="currentColor" d="M20 5v4h-2V7h-2V5h4zM4 5h4v2H6v2H4V5zm16 14h-4v-2h2v-2h2v4zM4 19v-4h2v2h2v2H4z"/></svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Progress Bar (Only show if it's not a truly endless LIVE stream) */}
                {duration !== Infinity && !isNaN(duration) && duration > 0 && (
                  <div className="relative flex items-center w-full mt-1">
                    <input type="range" min={0} max={duration} value={currentTime} onChange={handleSeekChange} className="w-full h-1 rounded-lg appearance-none cursor-pointer outline-none transition-all drop-shadow-md" style={{ background: rangeBackground }} />
                  </div>
                )}
              </div>

              {/* Quality Settings Menu */}
              {showPlayerSettings && (
                <div className="absolute right-6 bottom-24 bg-[#0f0f0f]/95 backdrop-blur-md border border-gray-800 rounded-xl py-2 shadow-2xl z-50 w-64 text-left pointer-events-auto no-scrollbar max-h-[300px] overflow-y-auto keep-menus-open">
                  <div className="flex flex-col">
                    <div className="px-5 py-3 border-b border-gray-700/50 text-white text-sm font-bold flex items-center gap-4">
                       <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> Quality
                    </div>
                    {availableQualities.map((item) => (
                      <button key={item.index} onClick={() => selectQuality(item)} className={`w-full text-left px-5 py-3 text-sm transition flex items-center justify-between ${quality === item.name ? 'text-[#0084ff] bg-white/10 font-bold' : 'text-gray-300 hover:bg-white/5'}`}>
                        <span>{item.name}</span>{quality === item.name && <svg className="w-4 h-4 fill-current text-[#0084ff]" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
