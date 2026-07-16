'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import 'shaka-player/dist/controls.css';
import { Search, Tv, PlayCircle, X, Loader2, ArrowLeft, WifiOff, AlertTriangle, RefreshCcw, Heart } from 'lucide-react';

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
      className={`relative w-full aspect-square bg-white rounded-xl p-2 md:p-3 flex items-center justify-center 
        transition-all duration-300 ease-in-out hover:scale-105 active:scale-95 focus:outline-none focus-visible:scale-105 focus-visible:ring-4 focus-visible:ring-[#0084ff]
        ${isActive ? 'ring-4 ring-[#0084ff] scale-105 shadow-[0_0_15px_rgba(0,132,255,0.5)]' : 'border border-gray-200 shadow-sm opacity-95 hover:opacity-100'}`}
    >
      {(!loaded || error) && (
        <div className="absolute inset-0 flex items-center justify-center p-2">
          <span className="text-[10px] md:text-xs font-bold text-gray-500 text-center uppercase tracking-wider leading-tight">{channel.name}</span>
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

// Added Zee5 strictly mapped into category order natively
const CATEGORY_ORDER = ['All', 'Premium', 'Zee5', 'Favorites', 'Sports', 'Entertainment', 'News', 'Movies', 'Music', 'Kids', 'Bhojpuri'];

// Format time utility
const formatDuration = (seconds) => {
  if (isNaN(seconds) || seconds === Infinity) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const formatLiveLatency = (seconds) => {
  const s = Math.abs(Math.floor(seconds));
  const m = Math.floor(s / 60);
  const remS = s % 60;
  return `-${m.toString().padStart(2, '0')}:${remS.toString().padStart(2, '0')}`;
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
  const [lastPlayedHistory, setLastPlayedHistory] = useState([]);

  // UI States
  const [activeChannel, setActiveChannel] = useState(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  
  // Custom Player States
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  
  // Media Quality States
  const [quality, setQuality] = useState('Auto');
  const [activeResolution, setActiveResolution] = useState('');
  const [availableQualities, setAvailableQualities] = useState([{ index: -1, name: 'Auto' }]);
  const [showPlayerSettings, setShowPlayerSettings] = useState(false);
  
  const [audioTracks, setAudioTracks] = useState([]);
  const [selectedAudio, setSelectedAudio] = useState(null);
  
  // LIVE Stream States
  const [isLiveStream, setIsLiveStream] = useState(false);
  const [liveLatencyText, setLiveLatencyText] = useState('LIVE');
  const [seekRange, setSeekRange] = useState({ start: 0, end: 100 });
  
  // Skip Animations & Pinch Zoom
  const [skipAccumulator, setSkipAccumulator] = useState(0);
  const [skipSide, setSkipSide] = useState(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomMessage, setZoomMessage] = useState('');

  // Refs
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const tokenRef = useRef(""); 
  const activeChannelRef = useRef(null);
  const showPlayerSettingsRef = useRef(false);
  
  const isUserManualAudio = useRef(false); 
  const isUserManualVideo = useRef(false); 
  
  const controlsTimeoutRef = useRef(null);
  const skipTimeoutRef = useRef(null);
  const currentSkipSide = useRef(null);
  const pinchRef = useRef({ initialDist: 0, isPinching: false });
  const zoomToastTimer = useRef(null);

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
      
      // Parse History (Handles conversion from old single object format to new 4-item array)
      let savedHistory = JSON.parse(localStorage.getItem('last_played_8481') || '[]');
      if (!Array.isArray(savedHistory)) {
        savedHistory = savedHistory && savedHistory.id ? [{ id: savedHistory.id, name: savedHistory.name }] : [];
      }
      setLastPlayedHistory(savedHistory);

      const handlePopState = () => { 
        if (activeChannelRef.current) setActiveChannel(null); 
      };
      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
    }
  }, []);

  // Update refs for global Event Listeners
  useEffect(() => { activeChannelRef.current = activeChannel; }, [activeChannel]);
  useEffect(() => { showPlayerSettingsRef.current = showPlayerSettings; }, [showPlayerSettings]);

  // TV Remote & Keyboard Event Listener (Fire TV Compatible)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing in the search bar
      const isInput = e.target.tagName === 'INPUT';
      if (isInput && e.key !== 'Escape') return;

      // Global TV Remote Media Keys
      if (['MediaPlayPause', 'MediaPlay', 'MediaPause'].includes(e.code) || e.key === 'MediaPlayPause') {
        if (videoRef.current) {
          if (videoRef.current.paused) videoRef.current.play().catch(()=>{});
          else videoRef.current.pause();
        }
        e.preventDefault();
        return;
      }

      // Back / Escape button handling (Tizen back is 10009)
      if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 10009) {
        if (showPlayerSettingsRef.current) {
          setShowPlayerSettings(false);
          e.preventDefault();
        } else if (activeChannelRef.current && !isInput) {
          setActiveChannel(null); // Force local state reset
          if (window.history.state && window.history.state.playerOpen) window.history.back();
          e.preventDefault();
        }
        return;
      }

      // Video Navigation (Active Player)
      if (activeChannelRef.current && !showPlayerSettingsRef.current && !isInput) {
        const isButton = e.target.tagName === 'BUTTON';

        if (e.key === 'ArrowLeft' || e.key === 'MediaRewind') {
          if (!isButton) { // only shortcut if not highlighting a button via D-pad
            e.preventDefault();
            handleButtonSkip(true, null);
          }
        } else if (e.key === 'ArrowRight' || e.key === 'MediaFastForward') {
          if (!isButton) {
            e.preventDefault();
            handleButtonSkip(false, null);
          }
        } else if (e.key === ' ' || e.key === 'Enter') {
          if (!isButton) {
            e.preventDefault();
            if (videoRef.current) {
              if (videoRef.current.paused) videoRef.current.play().catch(()=>{});
              else videoRef.current.pause();
            }
          }
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          // Wake controls on up/down
          setShowControls(true);
          resetControlsTimer();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Smart Fullscreen & Orientation Listeners
  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    const handleOrientationChange = () => {
      if (!activeChannelRef.current || !containerRef.current) return;
      
      const checkOrientation = () => {
        const isLandscape = window.matchMedia("(orientation: landscape)").matches;
        if (isLandscape && !document.fullscreenElement) {
           if (containerRef.current.requestFullscreen) {
             containerRef.current.requestFullscreen().catch(()=>{});
           } else if (videoRef.current?.webkitEnterFullscreen) { // iOS fallback
             videoRef.current.webkitEnterFullscreen();
           }
        } else if (!isLandscape && document.fullscreenElement) {
           if (document.exitFullscreen) {
             document.exitFullscreen().catch(()=>{});
           } else if (videoRef.current?.webkitExitFullscreen) { // iOS fallback
             videoRef.current.webkitExitFullscreen();
           }
        }
      };

      // Check immediately and fallback slightly after layout computes
      setTimeout(checkOrientation, 300);
      setTimeout(checkOrientation, 800);
    };

    window.addEventListener('orientationchange', handleOrientationChange);
    return () => window.removeEventListener('orientationchange', handleOrientationChange);
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

  // 2. Fetch Core APIs
  useEffect(() => {
    if (!isMounted || isOffline) return;
    const fetchInitialData = async () => {
      try {
        setIsLoading(true);
        const ts = new Date().getTime();
        
        // ADDED ZEE5 API FETCH ALONG WITH PREVIOUS APIS
        const [tokenRes, standardRes, premRes, dictKeysRes, dictUrlsRes, zeeRes] = await Promise.allSettled([
          fetch('https://allinonereborn2.online/jstrweb2/cookies.json'),
          fetch(`https://jtvxweb.pages.dev/jstr4web.json?t=${ts}`),
          fetch(`https://sayan-json-3.pages.dev/Data/sports.json?t=${ts}`),
          fetch(`https://raw.githubusercontent.com/live4wap/links/refs/heads/main/jiomb?t=${ts}`),
          fetch(`https://tv.wapgotube.workers.dev/proxy/https://allinonereborn2.online/jtv-fetch/jstarcookie/cookie.json?t=${ts}`),
          fetch(`https://tv.wapgotube.workers.dev/proxy/https://allinonereborn2.online/zee5/channels199.json?t=${ts}`)
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

        // NEW: ZEE5 DATA PROCESSING
        let zeeData = [];
        if (zeeRes.status === 'fulfilled') {
          try {
            const zeeJson = await zeeRes.value.json();
            if (zeeJson && zeeJson.channels) {
              zeeData = zeeJson.channels.map(c => ({
                id: c.name.replace(/\s+/g, '_').toLowerCase(),
                name: c.name,
                url: c.mpd,
                keyId: c.clearkey?.keyId || null,
                key: c.clearkey?.key || null,
                cookie: "",
                category: 'Zee5',
                logo: c.logo
              }));
            }
          } catch (e) {}
        }

        const customChannels = [
          { name: "Dangal", url: "https://live-dangal.akamaized.net/liveabr/pub-iodang10p4al/live_720p/chunks.m3u8", keyId: "null", key: "null", cookie: "", category: "Entertainment", logo: "https://dangaplay-json.s3.ap-south-1.amazonaws.com/Dangal_1x1.jpg?bf=0&f=jpg&p=true&q=85&w=300" },
          { name: "Dangal 2", url: "https://live-dangal2.akamaized.net/liveabr/pub-iodanga2a26kj2/live_720p/chunks.m3u8", keyId: "null", key: "null", cookie: "", category: "Entertainment", logo: "https://dangaplay-json.s3.ap-south-1.amazonaws.com/Dangal2_1x1.jpg?bf=0&f=jpg&p=true&q=85&w=50" },
          { name: "Bhojpuri Cinema", url: "https://live-bhojpuri.akamaized.net/liveabr/pub-iobhojpuqbu6yj/live_720p/chunks.m3u8", keyId: "null", key: "null", cookie: "", category: "Bhojpuri", logo: "https://dangaplay-json.s3.ap-south-1.amazonaws.com/BhojpuriCinema_1x1.jpg?bf=0&f=jpg&p=true&q=85&w=250" }
        ];

        // ADDED ZEE5 TO RAW COMBINED
        const rawCombined = [...premiumData, ...zeeData, ...customChannels, ...standardData];

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
      const shaka = await import('shaka-player'); 
      shaka.polyfill.installAll();
      if (!shaka.Player.isBrowserSupported()) return;

      const player = new shaka.Player(videoRef.current);
      
      player.addEventListener('error', (e) => {
        console.error('Shaka Player Error', e.detail);
        setPlayerError("Stream unavailable or DRM error. Please try another channel.");
      });

      player.addEventListener('variantchanged', () => {
        const tracks = player.getVariantTracks();
        const active = tracks.find(t => t.active);
        if (active && active.height) {
          setActiveResolution(`${active.height}p`);
        }
      });

      player.addEventListener('trackschanged', () => {
        const tracks = player.getVariantTracks();
        
        // Setup Video Qualities
        const uniqueVideo = new Map();
        tracks.forEach(t => { if (t.height && !uniqueVideo.has(t.height)) uniqueVideo.set(t.height, t); });
        const sortedVideo = Array.from(uniqueVideo.values()).sort((a, b) => b.height - a.height);
        setAvailableQualities([{ index: -1, name: 'Auto' }, ...sortedVideo.map(t => ({ index: t.id, name: `${t.height}p`, track: t }))]);

        // Setup Audio Qualities
        const uniqueAudio = new Map();
        tracks.forEach(t => { if (t.audioBandwidth && !uniqueAudio.has(t.audioBandwidth)) uniqueAudio.set(t.audioBandwidth, t); });
        const sortedAudio = Array.from(uniqueAudio.values()).sort((a,b) => b.audioBandwidth - a.audioBandwidth);
        setAudioTracks(sortedAudio);
        
        // Auto-Lock Highest Audio Logic
        if (sortedAudio.length > 0 && !isUserManualAudio.current) {
          const highestAudioTrack = sortedAudio[0];
          setSelectedAudio(highestAudioTrack.audioBandwidth);
          
          if (sortedAudio.length > 1) {
            isUserManualAudio.current = true;
            player.configure({ abr: { enabled: false } }); // Lock ABR
            
            const activeTrack = tracks.find(t => t.active);
            const targetHeight = activeTrack ? activeTrack.height : (sortedVideo.length > 0 ? sortedVideo[0].height : null);
            
            // Try to match highest audio with active video height first
            let targetVariant = tracks.find(t => t.audioBandwidth === highestAudioTrack.audioBandwidth && t.height === targetHeight);
            if (!targetVariant) {
               targetVariant = tracks.find(t => t.audioBandwidth === highestAudioTrack.audioBandwidth);
            }
            
            if (targetVariant) {
              player.selectVariantTrack(targetVariant, true, true);
            }
          }
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
      setIsLiveStream(false);
      isUserManualAudio.current = false; 
      isUserManualVideo.current = false;
      return;
    }
    const loadStream = async () => {
      try {
        setPlayerError(null);
        setIsBuffering(true);
        isUserManualVideo.current = false; 
        isUserManualAudio.current = false;
        setQuality('Auto');
        
        let drmConfig = { clearKeys: {} };
        if (activeChannel.keyId && activeChannel.key && activeChannel.keyId !== "null" && activeChannel.key !== "null") {
          drmConfig.clearKeys[activeChannel.keyId] = activeChannel.key;
        }
        
        // Prioritize highest bandwidth globally upfront
        playerRef.current.configure({
          drm: drmConfig,
          manifest: { dash: { ignoreDrmInfo: false } },
          streaming: { bufferingGoal: 5 },
          abr: { defaultBandwidthEstimate: 10000000, enabled: true }
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

        if (videoRef.current) {
          videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
        }

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

  // Handle Playback Time & Live Latency Sync
  const handleTimeUpdate = (e) => {
    const current = e.currentTarget.currentTime;
    setCurrentTime(current);

    if (playerRef.current && playerRef.current.isLive()) {
      setIsLiveStream(true);
      const range = playerRef.current.seekRange();
      setSeekRange(range);
      
      const latency = range.end - current;
      if (latency <= 12) { 
        setLiveLatencyText('LIVE');
      } else {
        setLiveLatencyText(formatLiveLatency(latency));
      }
    } else {
      setIsLiveStream(false);
    }
  };

  const seekToLiveEdge = () => {
    if (videoRef.current && playerRef.current) {
      videoRef.current.currentTime = playerRef.current.seekRange().end;
    }
  };

  const handleSeekChange = (e) => {
    const nextTime = parseFloat(e.target.value);
    setCurrentTime(nextTime);
    if (videoRef.current) videoRef.current.currentTime = nextTime;
  };

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
    if (e) e.stopPropagation();
    setShowControls(true);
    resetControlsTimer();
    
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

  const handleTouchStart = (e) => {
    if (e.touches.length === 2 && (document.fullscreenElement || window.innerWidth > window.innerHeight)) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      pinchRef.current = { initialDist: dist, isPinching: true };
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && pinchRef.current.isPinching) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const delta = dist - pinchRef.current.initialDist;
      
      if (delta > 40 && !isZoomed) {
        setIsZoomed(true);
        showZoomToast("Zoomed to fill");
        pinchRef.current.isPinching = false;
      } else if (delta < -40 && isZoomed) {
        setIsZoomed(false);
        showZoomToast("Original");
        pinchRef.current.isPinching = false;
      }
    }
  };

  const handleTouchEnd = (e) => {
    if (e.touches.length < 2) pinchRef.current.isPinching = false;
  };

  const showZoomToast = (msg) => {
    setZoomMessage(msg);
    clearTimeout(zoomToastTimer.current);
    zoomToastTimer.current = setTimeout(() => setZoomMessage(''), 2000);
  };

  const handleInteraction = () => {
    setShowControls(prev => !prev);
    if (isPlaying && !showControls) resetControlsTimer();
  };

  const toggleFullscreen = async (e) => {
    e?.stopPropagation();
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      try {
        if (containerRef.current.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        } else if (videoRef.current?.webkitEnterFullscreen) {
          videoRef.current.webkitEnterFullscreen();
        }
        if (screen.orientation && screen.orientation.lock) {
          await screen.orientation.lock('landscape');
        }
      } catch (err) {}
    } else {
      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (videoRef.current?.webkitExitFullscreen) {
          videoRef.current.webkitExitFullscreen();
        }
        if (screen.orientation && screen.orientation.unlock) {
          screen.orientation.unlock();
        }
      } catch (err) {}
    }
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
      isUserManualVideo.current = false;
      playerRef.current.configure({ abr: { enabled: true } });
      setQuality('Auto');
    } else {
      isUserManualVideo.current = true;
      playerRef.current.configure({ abr: { enabled: false } });
      playerRef.current.selectVariantTrack(item.track, true, false);
      setQuality(item.name);
    }
    setShowPlayerSettings(false);
  };

  const handleAudioManualChange = (e) => {
    const targetBw = Number(e.target.value);
    setSelectedAudio(targetBw);
    isUserManualAudio.current = true; // Lock audio manual preference
    
    if (playerRef.current) {
      // Disable ABR completely so it stays locked to this selected variant
      playerRef.current.configure({ abr: { enabled: false } });
      
      const tracks = playerRef.current.getVariantTracks();
      const activeTrack = tracks.find(t => t.active);
      const targetHeight = activeTrack ? activeTrack.height : null;
      
      // Try to match the same video resolution with the new audio track first
      let targetTrack = tracks.find(t => t.audioBandwidth === targetBw && t.height === targetHeight);
      
      // If no exact match, just get any variant with that audio bandwidth
      if (!targetTrack) {
        targetTrack = tracks.find(t => t.audioBandwidth === targetBw);
      }
      
      if (targetTrack) {
        playerRef.current.selectVariantTrack(targetTrack, true, true);
      }
    }
  };

  const handleChannelSelect = useCallback((channel) => {
    if (!activeChannelRef.current && typeof window !== 'undefined') window.history.pushState({ playerOpen: true }, '');
    else if (typeof window !== 'undefined') window.history.replaceState({ playerOpen: true }, '');
    
    setActiveChannel(channel);
    setSearchQuery('');
    
    // Manage History: Keep up to 4 items, store only {id, name}
    setLastPlayedHistory(prev => {
      const filtered = prev.filter(c => c.name !== channel.name && c.id !== channel.id);
      const updated = [{ id: channel.id, name: channel.name }, ...filtered].slice(0, 4);
      localStorage.setItem('last_played_8481', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const handleUiBack = () => {
    setActiveChannel(null);
    if (window.history.state && window.history.state.playerOpen) {
      window.history.back();
    }
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

  const similarChannels = useMemo(() => {
    if (!activeChannel) return [];
    const activeCat = activeChannel.category || activeChannel.group || activeChannel.group_title || 'Others';
    return channels.filter(c => {
      const cCat = c.category || c.group || c.group_title || 'Others';
      return cCat === activeCat && c.name !== activeChannel.name;
    });
  }, [channels, activeChannel]);

  // Construct history objects dynamically from fresh fetched data
  const historyChannelsToRender = useMemo(() => {
    return lastPlayedHistory
      .map(hist => channels.find(c => (c.id && c.id === hist.id) || (c.name && c.name === hist.name)))
      .filter(Boolean);
  }, [lastPlayedHistory, channels]);

  if (!isMounted) return <div className="h-screen w-screen bg-[#020813]" />;

  if (isOffline) {
    return (
      <div className="flex flex-col items-center justify-center h-[100dvh] w-full bg-[#020813] text-white">
        <WifiOff size={70} className="text-pink-500 mb-6 drop-shadow-[0_0_15px_rgba(236,72,153,0.5)] animate-pulse" />
        <h1 className="text-2xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-indigo-400 mb-2">NO INTERNET</h1>
        <p className="text-blue-200/50 text-sm mb-8 text-center max-w-[250px] leading-relaxed">Please check your network connection and try again.</p>
        <button onClick={() => { if(navigator.onLine) setIsOffline(false); }} className="flex items-center gap-2 px-8 py-3 bg-blue-900/20 hover:bg-blue-900/40 border border-blue-400/20 rounded-full font-bold tracking-widest transition-colors focus-visible:ring-4 focus-visible:ring-pink-500 outline-none"><RefreshCcw size={18} /> RETRY</button>
      </div>
    );
  }

  let progressPercent = 0;
  if (isLiveStream) {
    const rangeLen = seekRange.end - seekRange.start;
    const pos = currentTime - seekRange.start;
    progressPercent = rangeLen > 0 ? (pos / rangeLen) * 100 : 100;
  } else {
    const totalDuration = duration || 100;
    progressPercent = totalDuration > 0 && totalDuration !== Infinity ? (currentTime / totalDuration) * 100 : 0;
  }
  progressPercent = Math.max(0, Math.min(100, progressPercent));
  const rangeBackground = `linear-gradient(to right, #0084ff 0%, #0084ff ${progressPercent}%, rgba(255,255,255,0.3) ${progressPercent}%, rgba(255,255,255,0.3) 100%)`;
  const pointerEventsClass = showControls ? 'pointer-events-auto' : 'pointer-events-none';

  return (
    <div className="flex h-[100dvh] w-full bg-[#070b13] text-white font-sans overflow-hidden selection:bg-[#0084ff]/30">
      
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
        
        /* Premium Bottom Sheet / Modal Animations */
        @keyframes popUpModalMobile { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes popUpModalDesktop { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .yt-modal-mobile { animation: popUpModalMobile 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .yt-modal-desktop { animation: popUpModalDesktop 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}} />

      <aside className={`flex flex-col bg-[#061121] border-r border-blue-400/10 z-10 ${activeChannel ? 'hidden' : 'flex-1 w-full md:w-[400px] lg:w-[450px] md:flex-none'}`}>
        <div className="p-4 flex flex-shrink-0 items-center justify-between border-b border-blue-400/10 bg-[#0a182b]">
          <div className="flex items-center gap-2 text-[#0084ff]">
            <Tv size={24} className="drop-shadow-[0_0_5px_rgba(0,132,255,0.5)]" />
            <h1 className="text-lg md:text-xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-[#0084ff] to-indigo-400">Live@8481</h1>
          </div>
          <button onClick={() => setIsSearchOpen(!isSearchOpen)} className="p-2 rounded-full bg-blue-900/20 hover:bg-blue-900/40 focus-visible:ring-2 focus-visible:ring-blue-400 transition-colors text-blue-200 outline-none">
            {isSearchOpen ? <X size={20} /> : <Search size={20} />}
          </button>
        </div>

        {isSearchOpen && (
          <div className="p-3 bg-[#0a182b] flex-shrink-0 animate-in slide-in-from-top-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400/50" size={16} />
              <input type="text" placeholder="Search channels..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="w-full bg-[#11223d] border border-blue-400/20 rounded-lg py-2.5 pl-9 pr-4 text-sm text-white focus:outline-none focus:border-[#0084ff] focus-visible:ring-1 focus-visible:ring-[#0084ff] transition-colors"
              />
            </div>
          </div>
        )}

        <div className="p-3 border-b border-blue-400/10 bg-[#061121] flex-shrink-0">
          <div className="flex overflow-x-auto gap-2 pb-2 no-scrollbar scroll-smooth overscroll-none">
            {categories.map((cat) => (
              <button key={cat} onClick={() => setActiveCategory(cat)}
                className={`whitespace-nowrap flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[13px] font-bold tracking-wider transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-white outline-none ${
                  activeCategory === cat ? 'bg-[#0084ff] text-white shadow-md' 
                  : cat === 'Favorites' ? 'bg-pink-500/10 text-pink-400 hover:bg-pink-500/20 border border-pink-500/20'
                  : cat === 'Premium' ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20' 
                  : cat === 'Zee5' ? 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/20'
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
              {activeCategory === 'All' && !searchQuery && historyChannelsToRender.length > 0 && (
                <div className="mb-6 bg-[#0a182b]/50 p-3 rounded-2xl border border-blue-400/5">
                  <h2 className="text-blue-200/80 text-[11px] font-bold mb-3 uppercase tracking-widest flex items-center gap-2">
                    <PlayCircle size={14} className="text-[#0084ff]" /> Continue Watching
                  </h2>
                  <div className="grid grid-cols-4 gap-2">
                    {historyChannelsToRender.map((c, idx) => (
                      <ChannelCard key={`hist-${idx}`} channel={c} isActive={false} onClick={handleChannelSelect} />
                    ))}
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

      <main className={`flex-col bg-black z-20 transition-all duration-0 ${activeChannel ? 'flex w-full h-[100dvh]' : 'hidden md:flex flex-1 h-[100dvh]'}`}>
        
        <div className="flex flex-col landscape:flex-row md:flex-row flex-1 overflow-hidden">
          
          <div className="w-full landscape:flex-1 md:flex-1 relative flex items-center justify-center aspect-video landscape:aspect-auto md:aspect-auto bg-black overflow-hidden group">
            
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
                <button onClick={() => { const temp = activeChannel; setActiveChannel(null); setTimeout(() => setActiveChannel(temp), 50); }} className="flex items-center gap-2 px-6 py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full font-bold tracking-widest transition-colors focus-visible:ring-4 focus-visible:ring-white outline-none text-white text-sm"><RefreshCcw size={16} /> RETRY</button>
              </div>
            )}

            <div ref={containerRef} onMouseMove={handleMouseMove} className={`absolute inset-0 w-full h-full z-10 ${!activeChannel ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              <video 
                ref={videoRef} 
                onTimeUpdate={handleTimeUpdate}
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

              <div 
                onClick={handleInteraction} 
                onTouchStart={handleTouchStart} 
                onTouchMove={handleTouchMove} 
                onTouchEnd={handleTouchEnd}
                className="absolute inset-0 z-10 cursor-pointer touch-none" 
              />

              {zoomMessage && (
                <div className="absolute top-[80px] left-1/2 -translate-x-1/2 bg-black/80 text-white px-5 py-2 rounded-full text-sm font-bold tracking-wide z-50 pointer-events-none transition-opacity duration-300 shadow-xl backdrop-blur-sm">
                  {zoomMessage}
                </div>
              )}

              {/* SKIP ANIMATIONS - Z-40 */}
              <div className={`absolute left-0 top-0 bottom-[80px] w-[30%] bg-white/10 flex flex-col justify-center items-center pointer-events-none z-40 transition-opacity duration-200 ${skipSide === 'left' ? 'opacity-100' : 'opacity-0'}`}>
                <div className="flex text-white drop-shadow-lg">
                  <svg className="w-9 h-9 anim-arr-l" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                  <svg className="w-9 h-9 anim-arr-l dly-1 -ml-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                  <svg className="w-9 h-9 anim-arr-l dly-2 -ml-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                </div>
                <span className="text-white text-sm font-bold mt-2 drop-shadow-md">-{Math.abs(skipAccumulator)}s</span>
              </div>
              <div className={`absolute right-0 top-0 bottom-[80px] w-[30%] bg-white/10 flex flex-col justify-center items-center pointer-events-none z-40 transition-opacity duration-200 ${skipSide === 'right' ? 'opacity-100' : 'opacity-0'}`}>
                <div className="flex text-white drop-shadow-lg">
                  <svg className="w-9 h-9 anim-arr-r dly-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  <svg className="w-9 h-9 anim-arr-r dly-1 -ml-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  <svg className="w-9 h-9 anim-arr-r -ml-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </div>
                <span className="text-white text-sm font-bold mt-2 drop-shadow-md">+{Math.abs(skipAccumulator)}s</span>
              </div>

              {/* PERFECTLY CENTERED BUFFERING SPINNER - Z-40 */}
              <div className={`absolute top-0 left-0 w-full h-[calc(100%-20px)] flex justify-center items-center z-40 pointer-events-none transition-opacity duration-300 ${isBuffering ? 'opacity-100' : 'opacity-0'}`}>
                <div className="w-12 h-12 md:w-16 md:h-16 border-[3px] border-[#0084ff]/30 border-t-[#0084ff] rounded-full animate-spin"></div>
              </div>

              {/* PERFECTLY CENTERED PLAY/PAUSE/SKIP - Adjusted to sit gracefully above timeline */}
              <div className={`absolute top-0 left-0 w-full h-[calc(100%-20px)] flex items-center justify-center gap-14 sm:gap-20 md:gap-24 z-40 pointer-events-none transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
                <button onClick={(e) => handleButtonSkip(true, e)} className={`outline-none transition-transform hover:scale-105 active:scale-90 flex items-center rounded-full focus-visible:ring-4 focus-visible:ring-white/50 drop-shadow-[0_2px_15px_rgba(0,0,0,0.8)] ${pointerEventsClass}`}>
                  <svg className="w-10 h-10 sm:w-12 sm:h-12 text-white hover:text-[#0084ff] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
                </button>
                <div className={`w-12 h-12 md:w-16 md:h-16 flex items-center justify-center drop-shadow-[0_2px_15px_rgba(0,0,0,0.8)] ${pointerEventsClass}`}>
                  {!isBuffering && (
                    <button onClick={togglePlay} className="transition-transform hover:scale-110 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-white/50 rounded-full p-1">
                      {isPlaying ? (
                        <svg className="w-10 h-10 md:w-12 md:h-12 text-white fill-white" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                      ) : (
                        <svg className="w-10 h-10 md:w-12 md:h-12 text-white fill-white translate-x-1" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      )}
                    </button>
                  )}
                </div>
                <button onClick={(e) => handleButtonSkip(false, e)} className={`outline-none transition-transform hover:scale-105 active:scale-90 flex items-center rounded-full focus-visible:ring-4 focus-visible:ring-white/50 drop-shadow-[0_2px_15px_rgba(0,0,0,0.8)] ${pointerEventsClass}`}>
                  <svg className="w-10 h-10 sm:w-12 sm:h-12 text-white hover:text-[#0084ff] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                </button>
              </div>

              {/* YOUTUBE-STYLE SETTINGS MODAL - Fixed to viewport (Z-[100]) so it never hides in portrait */}
              {showPlayerSettings && (
                <div 
                  className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-black/60 pointer-events-auto transition-opacity"
                  onClick={() => setShowPlayerSettings(false)}
                >
                  <div 
                    onClick={(e) => e.stopPropagation()} 
                    className="bg-[#212121] w-full md:w-[320px] max-h-[75vh] flex flex-col rounded-t-2xl md:rounded-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] border border-white/5 yt-modal-mobile md:yt-modal-desktop overflow-hidden"
                  >
                    <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-[#282828] z-10 shadow-sm">
                      <span className="text-white text-sm font-bold tracking-wide">Video Quality</span>
                      <button onClick={() => setShowPlayerSettings(false)} className="text-gray-400 hover:text-white transition outline-none focus-visible:ring-2 focus-visible:ring-white rounded-md p-1">
                        <X size={20} />
                      </button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto no-scrollbar py-2">
                      {availableQualities.map((item) => {
                        const isAuto = item.index === -1;
                        const displayName = isAuto && activeResolution ? `Auto (${activeResolution})` : item.name;
                        const isActive = quality === item.name;
                        
                        return (
                          <button 
                            key={item.index} 
                            onClick={() => selectQuality(item)} 
                            className="w-full text-left px-5 py-4 text-sm transition flex items-center justify-between text-gray-200 hover:bg-white/10 active:bg-white/20 outline-none focus-visible:bg-white/20"
                          >
                            <span className={isActive ? 'font-black text-white' : 'font-medium'}>{displayName}</span>
                            {isActive && (
                              <svg className="w-5 h-5 text-white fill-current" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* CONTROLS OVERLAY (Top & Bottom Bars) - Z-30 */}
              <div className={`absolute inset-0 flex flex-col justify-between p-4 md:p-6 z-30 transition-opacity duration-300 pointer-events-none ${showControls ? 'opacity-100 bg-black/50' : 'opacity-0'}`}
                   style={{ paddingTop: 'env(safe-area-inset-top, 16px)', paddingBottom: 'env(safe-area-inset-bottom, 16px)', paddingLeft: 'env(safe-area-inset-left, 16px)', paddingRight: 'env(safe-area-inset-right, 16px)' }}>
                
                {/* Top Bar - Adjusted to pull away from the very edges */}
                <div className={`flex items-center justify-between ${pointerEventsClass} w-full pt-4 pl-4`}>
                  <div className="flex items-center gap-3">
                    <button onClick={handleUiBack} className="p-1 hover:text-[#0084ff] transition active:scale-95 drop-shadow-md rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white">
                      <ArrowLeft size={34} className="text-white" />
                    </button>
                    <div className="text-white text-lg md:text-xl font-bold truncate max-w-[200px] md:max-w-md">{activeChannel?.name}</div>
                    <button onClick={toggleFavorite} className="text-pink-500 hover:text-pink-400 p-1 transition-transform active:scale-75 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-pink-500">
                      <Heart size={20} className={activeChannel && favorites.includes(activeChannel.name) ? "fill-pink-500" : "fill-none"} />
                    </button>
                  </div>
                </div>

                {/* Bottom Bar */}
                <div className={`flex flex-col gap-2 ${pointerEventsClass} pb-2 w-full mt-auto relative z-10`}>
                  
                  <div className="relative flex items-center w-full mb-1 px-[10px]">
                    <input 
                      type="range" 
                      min={isLiveStream ? seekRange.start : 0} 
                      max={isLiveStream ? seekRange.end : (duration || 100)} 
                      value={currentTime} 
                      onChange={handleSeekChange} 
                      className="w-full h-1 rounded-lg appearance-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#0084ff] transition-all drop-shadow-md" 
                      style={{ background: rangeBackground }} 
                    />
                  </div>

                  <div className="flex items-center justify-between text-sm text-gray-100 drop-shadow-md">
                    
                    {isLiveStream ? (
                      <div className="flex items-center font-bold tracking-wide text-sm">
                        {liveLatencyText === 'LIVE' ? (
                          <div onClick={seekToLiveEdge} className="flex items-center gap-1.5 cursor-pointer hover:scale-105 transition-transform rounded outline-none focus-visible:ring-2 focus-visible:ring-red-500 p-1">
                            <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
                            <span className="text-red-500 font-black tracking-widest drop-shadow-lg">LIVE</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 text-gray-300">
                              <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                              <span className="font-semibold">{liveLatencyText}</span>
                            </div>
                            <button 
                              onClick={(e) => { e.stopPropagation(); seekToLiveEdge(); }} 
                              className="px-2 py-0.5 ml-1 rounded bg-gray-600/80 hover:bg-gray-500 text-white text-[10px] md:text-xs font-bold uppercase tracking-wider transition-colors drop-shadow-md shadow-sm pointer-events-auto cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-white"
                            >
                              Go Live
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center font-normal tracking-wide text-sm text-[#e2e8f0]">
                        <span>{formatDuration(currentTime)}</span><span className="mx-1.5">/</span><span>{formatDuration(duration)}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-4">
                      <button onClick={togglePictureInPicture} className="p-1.5 text-white hover:text-[#0084ff] transition rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white">
                        <svg className="w-6 h-6 drop-shadow-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" /><rect x="13" y="11" width="7" height="5" rx="1" fill="currentColor" stroke="none" /></svg>
                      </button>

                      <button onClick={(e) => { e.stopPropagation(); setShowPlayerSettings(true); }} className="p-1.5 hover:text-[#0084ff] transition pointer-events-auto rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white">
                        <svg className="w-6 h-6 text-white drop-shadow-md transition-transform duration-300 hover:rotate-45" viewBox="0 0 24 24" fill="currentColor">
                           <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49-.12-.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/>
                        </svg>
                      </button>

                      <button onClick={toggleFullscreen} className="p-1.5 hover:text-[#0084ff] transition drop-shadow-md rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white">
                        {isFullscreen ? (
                          <svg className="w-6 h-6 text-white" viewBox="0 0 24 24"><path fill="currentColor" d="M18 7h-2V5h-2v4h4V7zM6 7v2h4V5H8v2H6zm12 10v-2h-4v4h2v-2h2zM6 17h2v2h2v-4H6v2z"/></svg>
                        ) : (
                          <svg className="w-6 h-6 text-white" viewBox="0 0 24 24"><path fill="currentColor" d="M20 5v4h-2V7h-2V5h4zM4 5h4v2H6v2H4V5zm16 14h-4v-2h2v-2h2v4zM4 19v-4h2v2h2v2H4z"/></svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {activeChannel && (
            <div className="w-full landscape:w-[280px] md:w-[320px] lg:w-[350px] flex-1 landscape:flex-none md:flex-none bg-[#0a182b] border-t landscape:border-t-0 landscape:border-l md:border-t-0 md:border-l border-blue-400/10 p-3 md:p-4 shadow-inner flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <h3 className="text-blue-200/60 text-[11px] md:text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-pink-500 animate-pulse"></span> More in {activeChannel.category || 'Category'}
                </h3>
                
                {audioTracks.length > 1 && (
                  <select
                    className="bg-white/5 border border-[#0084ff]/30 text-[10px] md:text-xs text-white rounded-md px-2 py-1 outline-none font-bold shadow-sm cursor-pointer hover:bg-white/10 transition-colors focus-visible:ring-2 focus-visible:ring-[#0084ff]"
                    value={selectedAudio || ''}
                    onChange={handleAudioManualChange}
                  >
                    {audioTracks.map(t => (
                      <option key={t.audioBandwidth} value={t.audioBandwidth} className="bg-[#0a182b] text-white">
                        Audio: {Math.round(t.audioBandwidth / 1000)} kbps
                      </option>
                    ))}
                  </select>
                )}
              </div>
              
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-2 gap-3 pb-2 overflow-y-auto scroll-smooth overscroll-none no-scrollbar content-start flex-1">
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
