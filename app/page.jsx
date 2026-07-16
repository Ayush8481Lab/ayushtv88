'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import 'shaka-player/dist/controls.css';
import { Search, Tv, PlayCircle, X, Loader2, ArrowLeft, WifiOff, AlertTriangle, RefreshCcw, Heart, Settings } from 'lucide-react';

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
// OPTIMIZED CARD COMPONENT 
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
      className={`relative w-full aspect-square rounded-xl p-2 md:p-3 flex items-center justify-center 
        transition-transform duration-200 ease-out hover:scale-105 active:scale-95
        ${isActive ? 'ring-4 ring-[#0084ff] scale-105 shadow-[0_0_15px_rgba(0,132,255,0.5)] bg-white' : 'border border-gray-200/40 shadow-sm bg-white hover:border-[#0084ff]/50'}`}
    >
      {(!loaded || error) && (
        <div className="absolute inset-0 flex items-center justify-center p-2">
          <span className="text-[10px] md:text-xs font-black text-gray-800 text-center uppercase tracking-wider leading-tight">{channel.name}</span>
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
          className={`w-full h-full object-contain pointer-events-none transition-opacity duration-300 ${loaded && !error ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </button>
  );
});
ChannelCard.displayName = "ChannelCard";

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

const CheckIcon = () => (
  <svg className="w-5 h-5 text-[#0084ff] fill-current drop-shadow-[0_0_5px_rgba(0,132,255,0.8)]" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
);

export default function PerfectPlayerUI() {
  const [isMounted, setIsMounted] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [playerError, setPlayerError] = useState(null);

  const [channels, setChannels] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [favorites, setFavorites] = useState([]);
  const [lastPlayed, setLastPlayed] = useState(null);

  const [activeChannel, setActiveChannel] = useState(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCSSFullscreen, setIsCSSFullscreen] = useState(false); // Fallback for landscape
  
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  
  // Strict Media Quality States
  const [showPlayerSettings, setShowPlayerSettings] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState('video'); // 'video' | 'audio'
  const [activeResolution, setActiveResolution] = useState('');
  const [videoQuality, setVideoQuality] = useState('Auto'); // 'Auto' or height
  const [audioQuality, setAudioQuality] = useState('Auto'); // 'Auto' or bandwidth
  const [availableVideoHeights, setAvailableVideoHeights] = useState([]);
  const [availableAudioBandwidths, setAvailableAudioBandwidths] = useState([]);
  
  const [isLiveStream, setIsLiveStream] = useState(false);
  const [liveLatencyText, setLiveLatencyText] = useState('LIVE');
  const [seekRange, setSeekRange] = useState({ start: 0, end: 100 });
  
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
  
  const controlsTimeoutRef = useRef(null);
  const skipTimeoutRef = useRef(null);
  const currentSkipSide = useRef(null);
  const pinchRef = useRef({ initialDist: 0, isPinching: false });
  const zoomToastTimer = useRef(null);

  // Swipe Gesture Refs
  const touchStartX = useRef(null);
  const touchEndX = useRef(null);

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
        meta.content = "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover";
        document.head.appendChild(meta);
      }

      setFavorites(JSON.parse(localStorage.getItem('fav_channels_8481') || '[]'));
      setLastPlayed(JSON.parse(localStorage.getItem('last_played_8481') || 'null'));

      const handlePopState = () => { 
        if (activeChannelRef.current) setActiveChannel(null); 
      };
      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
    }
  }, []);

  // Strict Landscape Auto-Fullscreen (With CSS Fallback)
  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    const handleOrientationChange = () => {
      if (!activeChannelRef.current || !containerRef.current) return;
      // Allow slight delay for device rotation to register dimensions correctly
      setTimeout(async () => {
        const isLandscape = window.innerWidth > window.innerHeight;
        
        if (isLandscape && !document.fullscreenElement) {
          try {
             await containerRef.current.requestFullscreen();
             setIsCSSFullscreen(false);
          } catch (e) {
             // Browser blocked native fullscreen without user gesture -> Force CSS Fullscreen
             setIsCSSFullscreen(true);
          }
        } else if (!isLandscape) {
          if (document.fullscreenElement) {
             try { await document.exitFullscreen(); } catch (e) {}
          }
          setIsCSSFullscreen(false);
        }
      }, 300);
    };
    
    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleOrientationChange); 
    return () => {
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.removeEventListener('resize', handleOrientationChange);
    };
  }, []);

  useEffect(() => { activeChannelRef.current = activeChannel; }, [activeChannel]);

  // Fetch API Logic (Unchanged for reliability)
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

  // SHAKA PLAYER INIT
  useEffect(() => {
    if (!isMounted || isOffline || !videoRef.current || playerRef.current) return;

    const initPlayer = async () => {
      const shaka = await import('shaka-player'); 
      shaka.polyfill.installAll();
      if (!shaka.Player.isBrowserSupported()) return;

      const player = new shaka.Player(videoRef.current);
      
      player.addEventListener('error', (e) => {
        setPlayerError("Stream unavailable or DRM error. Please try another channel.");
      });

      player.addEventListener('variantchanged', () => {
        const tracks = player.getVariantTracks();
        const active = tracks.find(t => t.active);
        if (active && active.height) setActiveResolution(`${active.height}p`);
      });

      player.addEventListener('trackschanged', () => {
        const tracks = player.getVariantTracks();
        const heights = [...new Set(tracks.map(t => t.height).filter(Boolean))].sort((a, b) => b - a);
        setAvailableVideoHeights(heights);

        const audios = [...new Set(tracks.map(t => t.audioBandwidth).filter(Boolean))].sort((a, b) => b - a);
        setAvailableAudioBandwidths(audios);
        
        enforceQuality(player, tracks, videoQuality, audioQuality);
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

  // Deep Analysis strict lock mechanism for qualities
  const enforceQuality = useCallback((player, tracks, vQual, aQual) => {
    if (!tracks || tracks.length === 0) return;

    // Strict Audio Analysis: If 'Auto', force highest available track. 
    const maxAudioBw = Math.max(...tracks.map(t => t.audioBandwidth || 0));
    const targetAudioBw = aQual === 'Auto' ? maxAudioBw : Number(aQual);

    if (vQual === 'Auto') {
       // Enable ABR and lock Audio Bandwidth rigorously
       player.configure({
         abr: {
           enabled: true,
           restrictions: {
             minAudioBandwidth: targetAudioBw,
             maxAudioBandwidth: targetAudioBw
           }
         }
       });

       const active = tracks.find(t => t.active);
       if (active && active.audioBandwidth !== targetAudioBw) {
           const exactTrack = tracks.find(t => t.height === active.height && t.audioBandwidth === targetAudioBw);
           if (exactTrack) player.selectVariantTrack(exactTrack, true, false);
       }
    } else {
       // Manual selection logic 
       player.configure({ abr: { enabled: false } });
       const targetHeight = Number(vQual);
       
       let bestTrack = tracks.find(t => t.height === targetHeight && t.audioBandwidth === targetAudioBw);
       if (!bestTrack) {
          const peers = tracks.filter(t => t.height === targetHeight);
          peers.sort((a,b) => Math.abs((a.audioBandwidth||0) - targetAudioBw) - Math.abs((b.audioBandwidth||0) - targetAudioBw));
          bestTrack = peers[0];
       }
       if (bestTrack) player.selectVariantTrack(bestTrack, true, false);
    }
  }, []);

  // Effect to re-enforce when strictly changed by user
  useEffect(() => {
    if (playerRef.current) {
       enforceQuality(playerRef.current, playerRef.current.getVariantTracks(), videoQuality, audioQuality);
    }
  }, [videoQuality, audioQuality, enforceQuality]);

  // INSTANT PLAYBACK ENGINE
  useEffect(() => {
    if (!playerRef.current) return;
    if (!activeChannel) {
      playerRef.current.unload();
      setPlayerError(null);
      setIsPlaying(false);
      setIsLiveStream(false);
      return;
    }
    const loadStream = async () => {
      try {
        setPlayerError(null);
        setIsBuffering(true);
        
        // Reset strictly locked states
        setVideoQuality('Auto');
        setAudioQuality('Auto');
        setActiveResolution('');
        setAvailableVideoHeights([]);
        setAvailableAudioBandwidths([]);
        setActiveSettingsTab('video');
        
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

        if (videoRef.current) {
          videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
        }
      } catch (error) {
        if (error && error.code !== 7000) {
          setPlayerError("Failed to fetch stream data. Ensure your connection is stable.");
        }
      }
    };
    loadStream();
  }, [activeChannel]);

  const handleTimeUpdate = (e) => {
    const current = e.currentTarget.currentTime;
    setCurrentTime(current);

    if (playerRef.current && playerRef.current.isLive()) {
      setIsLiveStream(true);
      const range = playerRef.current.seekRange();
      setSeekRange(range);
      const latency = range.end - current;
      if (latency <= 12) setLiveLatencyText('LIVE');
      else setLiveLatencyText(formatLiveLatency(latency));
    } else {
      setIsLiveStream(false);
    }
  };

  const seekToLiveEdge = () => {
    if (videoRef.current && playerRef.current) {
      videoRef.current.currentTime = playerRef.current.seekRange().end;
    }
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

  const handleInteraction = () => {
    setShowControls(prev => !prev);
    if (isPlaying && !showControls) resetControlsTimer();
  };

  const toggleFullscreen = async (e) => {
    e?.stopPropagation();
    if (!containerRef.current) return;
    if (!document.fullscreenElement && !isCSSFullscreen) {
      try {
        await containerRef.current.requestFullscreen();
        if (screen.orientation && screen.orientation.lock) {
          await screen.orientation.lock('landscape');
        }
      } catch (err) { setIsCSSFullscreen(true); }
    } else {
      try {
        await document.exitFullscreen();
        if (screen.orientation && screen.orientation.unlock) {
          screen.orientation.unlock();
        }
      } catch (err) {}
      setIsCSSFullscreen(false);
    }
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
    if (isCSSFullscreen) {
       setIsCSSFullscreen(false);
       if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
       return;
    }
    setActiveChannel(null);
    if (window.history.state && window.history.state.playerOpen) {
      window.history.back();
    }
  };

  // Modern Swipe Logic for Settings
  const onSettingsTouchStart = (e) => touchStartX.current = e.targetTouches[0].clientX;
  const onSettingsTouchMove = (e) => touchEndX.current = e.targetTouches[0].clientX;
  const onSettingsTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const distance = touchStartX.current - touchEndX.current;
    if (distance > 40 && activeSettingsTab === 'video') setActiveSettingsTab('audio');
    if (distance < -40 && activeSettingsTab === 'audio') setActiveSettingsTab('video');
    touchStartX.current = null;
    touchEndX.current = null;
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

  if (!isMounted) return <div className="h-screen w-screen bg-[#020813]" />;

  if (isOffline) {
    return (
      <div className="flex flex-col items-center justify-center h-[100dvh] w-full bg-[#020813] text-white">
        <WifiOff size={70} className="text-pink-500 mb-6 drop-shadow-[0_0_15px_rgba(236,72,153,0.5)] animate-pulse" />
        <h1 className="text-2xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-indigo-400 mb-2">NO INTERNET</h1>
        <p className="text-blue-200/50 text-sm mb-8 text-center max-w-[250px] leading-relaxed">Please check your network connection and try again.</p>
        <button onClick={() => { if(navigator.onLine) setIsOffline(false); }} className="flex items-center gap-2 px-8 py-3 bg-blue-900/20 border border-blue-400/20 rounded-full font-bold tracking-widest transition-colors"><RefreshCcw size={18} /> RETRY</button>
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
  const pointerEventsClass = showControls ? 'pointer-events-auto' : 'pointer-events-none';

  // Dynamic Video Container Class
  const videoContainerClasses = isCSSFullscreen 
    ? "fixed inset-0 z-[9999] bg-black w-[100vw] h-[100dvh] flex flex-col items-center justify-center"
    : `absolute inset-0 w-full h-full z-10 ${!activeChannel ? 'opacity-0 pointer-events-none' : 'opacity-100'}`;

  return (
    <div className="flex h-[100dvh] w-full bg-[#070b13] text-white font-sans overflow-hidden selection:bg-[#0084ff]/30">
      
      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        input[type="range"] { background: transparent; }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #0084ff; cursor: pointer; border: none; }
        @keyframes fadeSlideRight { 0% { opacity: 0.2; transform: translateX(-2px); } 50% { opacity: 1; transform: translateX(2px); } 100% { opacity: 0.2; transform: translateX(-2px); } }
        @keyframes fadeSlideLeft { 0% { opacity: 0.2; transform: translateX(2px); } 50% { opacity: 1; transform: translateX(-2px); } 100% { opacity: 0.2; transform: translateX(2px); } }
        .anim-arr-r { animation: fadeSlideRight 0.6s ease-in-out infinite; }
        .anim-arr-l { animation: fadeSlideLeft 0.6s ease-in-out infinite; }
        .dly-1 { animation-delay: 0.1s; }
        .dly-2 { animation-delay: 0.2s; }
        @keyframes popUpModalMobile { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes popUpModalDesktop { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .yt-modal-mobile { animation: popUpModalMobile 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .yt-modal-desktop { animation: popUpModalDesktop 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}} />

      <aside className={`flex flex-col bg-[#061121] border-r border-blue-400/10 z-10 ${activeChannel ? 'hidden' : 'flex-1 w-full md:w-[400px] lg:w-[450px] md:flex-none'}`}>
        <div className="p-4 flex flex-shrink-0 items-center justify-between border-b border-blue-400/10 bg-[#0a182b]">
          <div className="flex items-center gap-2 text-[#0084ff]">
            <Tv size={24} className="drop-shadow-[0_0_5px_rgba(0,132,255,0.5)]" />
            <h1 className="text-lg md:text-xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-[#0084ff] to-indigo-400">Live@8481</h1>
          </div>
          <button onClick={() => setIsSearchOpen(!isSearchOpen)} className="p-2 rounded-full bg-blue-900/20 text-blue-200">
            {isSearchOpen ? <X size={20} /> : <Search size={20} />}
          </button>
        </div>

        {isSearchOpen && (
          <div className="p-3 bg-[#0a182b] flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400/50" size={16} />
              <input type="text" placeholder="Search channels..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#11223d] border border-blue-400/20 rounded-lg py-2.5 pl-9 pr-4 text-sm text-white focus:outline-none focus:border-[#0084ff]"
              />
            </div>
          </div>
        )}

        <div className="p-3 border-b border-blue-400/10 bg-[#061121] flex-shrink-0">
          <div className="flex overflow-x-auto gap-2 pb-2 no-scrollbar scroll-smooth">
            {categories.map((cat) => (
              <button key={cat} onClick={() => setActiveCategory(cat)}
                className={`whitespace-nowrap flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[13px] font-bold tracking-wider transition-colors ${
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

        <div className="flex-1 overflow-y-auto no-scrollbar scroll-smooth p-3 md:p-4">
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

      <main className={`flex-col bg-black z-20 transition-all duration-0 ${activeChannel ? 'flex w-full h-[100dvh]' : 'hidden md:flex flex-1 h-[100dvh]'}`}>
        
        <div className="flex flex-col landscape:flex-row md:flex-row flex-1 overflow-hidden">
          
          <div className="w-full landscape:flex-1 md:flex-1 relative flex items-center justify-center aspect-video landscape:aspect-auto md:aspect-auto bg-black overflow-hidden group">
            
            {!activeChannel && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#070b13] z-0">
                <PlayCircle size={70} className="text-blue-900/30 mb-4 drop-shadow-lg" />
                <p className="text-xl tracking-widest font-light text-blue-200/20">Select a channel to play</p>
              </div>
            )}

            <div ref={containerRef} onMouseMove={() => { if(!showControls) setShowControls(true); resetControlsTimer(); }} className={videoContainerClasses}>
              <video 
                ref={videoRef} 
                onTimeUpdate={handleTimeUpdate}
                onDurationChange={(e) => setDuration(e.currentTarget.duration)}
                onPlaying={() => { setIsBuffering(false); setIsPlaying(true); }}
                onPause={() => setIsPlaying(false)}
                onWaiting={() => setIsBuffering(true)}
                onSeeking={() => setIsBuffering(true)}
                onSeeked={() => setIsBuffering(false)}
                className={`w-full h-full transition-all duration-300 ease-in-out ${isZoomed ? 'object-cover' : 'object-contain'}`} 
                playsInline
                autoPictureInPicture={true}
              />

              <div 
                onClick={handleInteraction} 
                className="absolute inset-0 z-10 cursor-pointer touch-none" 
              />

              {zoomMessage && (
                <div className="absolute top-[80px] left-1/2 -translate-x-1/2 bg-black/80 text-white px-5 py-2 rounded-full text-sm font-bold tracking-wide z-50 pointer-events-none transition-opacity shadow-xl backdrop-blur-sm">
                  {zoomMessage}
                </div>
              )}

              {/* BUFFERING SPINNER - Z-40 */}
              <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-40 pointer-events-none transition-opacity duration-300 ${isBuffering ? 'opacity-100' : 'opacity-0'}`}>
                <div className="w-12 h-12 md:w-16 md:h-16 border-[3px] border-[#0084ff]/30 border-t-[#0084ff] rounded-full animate-spin"></div>
              </div>

              {/* CENTER CONTROLS - Z-40 */}
              <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center gap-14 sm:gap-20 md:gap-24 z-40 w-full pointer-events-none transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
                <div className={`w-12 h-12 md:w-16 md:h-16 flex items-center justify-center drop-shadow-[0_2px_15px_rgba(0,0,0,0.8)] ${pointerEventsClass}`}>
                  {!isBuffering && (
                    <button onClick={(e) => { e.stopPropagation(); if (videoRef.current.paused) videoRef.current.play(); else videoRef.current.pause(); }} className="transition-transform hover:scale-110 active:scale-95 focus:outline-none">
                      {isPlaying ? (
                        <svg className="w-10 h-10 md:w-12 md:h-12 text-white fill-white" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                      ) : (
                        <svg className="w-10 h-10 md:w-12 md:h-12 text-white fill-white translate-x-1" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* MODERN TABBED SETTINGS MODAL - Z-[60] */}
              {showPlayerSettings && (
                <div 
                  className="absolute inset-0 z-[60] flex items-end landscape:items-center justify-center bg-black/70 pointer-events-auto transition-opacity"
                  onClick={() => setShowPlayerSettings(false)}
                >
                  <div 
                    onClick={(e) => e.stopPropagation()} 
                    className="bg-[#1c1c1c] w-full md:w-[340px] landscape:w-[340px] flex flex-col rounded-t-3xl md:rounded-2xl landscape:rounded-2xl shadow-2xl border border-white/5 yt-modal-mobile md:yt-modal-desktop overflow-hidden max-h-[60vh] landscape:max-h-[85vh]"
                  >
                    {/* Header with modern tabs */}
                    <div className="flex flex-col border-b border-white/5 bg-[#242424] shrink-0 shadow-sm relative">
                       <div className="flex items-center justify-between px-5 pt-4 pb-2">
                          <h3 className="text-white text-base font-bold flex items-center gap-2"><Settings size={18} className="text-[#0084ff]" /> Stream Config</h3>
                          <button onClick={() => setShowPlayerSettings(false)} className="text-gray-400 hover:text-white transition rounded-full bg-white/5 p-1">
                            <X size={18} />
                          </button>
                       </div>
                       <div className="flex items-center w-full mt-1">
                          <button 
                            onClick={() => setActiveSettingsTab('video')} 
                            className={`flex-1 py-3 text-[13px] font-bold uppercase tracking-wider transition-colors border-b-[3px] ${activeSettingsTab === 'video' ? 'text-[#0084ff] border-[#0084ff] bg-[#0084ff]/5' : 'text-gray-400 border-transparent hover:bg-white/5'}`}
                          >
                            Video
                          </button>
                          <button 
                            onClick={() => setActiveSettingsTab('audio')} 
                            className={`flex-1 py-3 text-[13px] font-bold uppercase tracking-wider transition-colors border-b-[3px] ${activeSettingsTab === 'audio' ? 'text-[#0084ff] border-[#0084ff] bg-[#0084ff]/5' : 'text-gray-400 border-transparent hover:bg-white/5'}`}
                          >
                            Audio
                          </button>
                       </div>
                    </div>
                    
                    {/* Swipeable Body Area */}
                    <div 
                       onTouchStart={onSettingsTouchStart}
                       onTouchMove={onSettingsTouchMove}
                       onTouchEnd={onSettingsTouchEnd}
                       className="flex-1 overflow-y-auto no-scrollbar relative w-full h-full pb-2"
                    >
                      {/* Video Tab */}
                      {activeSettingsTab === 'video' && (
                        <div className="animate-in fade-in slide-in-from-left-4 duration-200">
                          <button 
                            onClick={() => setVideoQuality('Auto')} 
                            className="w-full text-left px-5 py-4 text-sm transition flex items-center justify-between text-gray-200 hover:bg-white/5 active:bg-white/10"
                          >
                            <span className={videoQuality === 'Auto' ? 'font-black text-white' : 'font-medium'}>
                              Auto {videoQuality === 'Auto' && activeResolution ? `(${activeResolution})` : ''}
                            </span>
                            {videoQuality === 'Auto' && <CheckIcon />}
                          </button>
                          {availableVideoHeights.map(h => (
                            <button 
                              key={`vid-${h}`} 
                              onClick={() => setVideoQuality(h)} 
                              className="w-full text-left px-5 py-4 text-sm transition flex items-center justify-between text-gray-200 hover:bg-white/5 active:bg-white/10"
                            >
                              <span className={videoQuality === h ? 'font-black text-white' : 'font-medium'}>{h}p</span>
                              {videoQuality === h && <CheckIcon />}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Audio Tab */}
                      {activeSettingsTab === 'audio' && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-200">
                          <button 
                            onClick={() => setAudioQuality('Auto')} 
                            className="w-full text-left px-5 py-4 text-sm transition flex items-center justify-between text-gray-200 hover:bg-white/5 active:bg-white/10"
                          >
                            <span className={audioQuality === 'Auto' ? 'font-black text-white' : 'font-medium'}>Highest (Auto)</span>
                            {audioQuality === 'Auto' && <CheckIcon />}
                          </button>
                          {availableAudioBandwidths.map(b => (
                            <button 
                              key={`aud-${b}`} 
                              onClick={() => setAudioQuality(b)} 
                              className="w-full text-left px-5 py-4 text-sm transition flex items-center justify-between text-gray-200 hover:bg-white/5 active:bg-white/10"
                            >
                              <span className={audioQuality === b ? 'font-black text-white' : 'font-medium'}>{Math.round(b/1000)} kbps Quality</span>
                              {audioQuality === b && <CheckIcon />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* CONTROLS OVERLAY - Z-30 */}
              <div className={`absolute inset-0 flex flex-col justify-between p-4 md:p-6 z-30 transition-opacity duration-300 pointer-events-none ${showControls ? 'opacity-100 bg-gradient-to-b from-black/70 via-transparent to-black/80' : 'opacity-0'}`}
                   style={{ paddingTop: 'env(safe-area-inset-top, 16px)', paddingBottom: 'env(safe-area-inset-bottom, 16px)', paddingLeft: 'env(safe-area-inset-left, 16px)', paddingRight: 'env(safe-area-inset-right, 16px)' }}>
                
                <div className={`flex items-center justify-between ${pointerEventsClass} w-full pt-1`}>
                  <div className="flex items-center gap-3">
                    <button onClick={handleUiBack} className="p-1.5 hover:text-[#0084ff] transition active:scale-95 drop-shadow-md bg-black/20 rounded-full backdrop-blur-sm">
                      <ArrowLeft size={22} className="text-white" />
                    </button>
                    <div className="text-white text-base md:text-xl font-bold truncate max-w-[200px] md:max-w-md drop-shadow-md">{activeChannel?.name}</div>
                    <button onClick={toggleFavorite} className="text-pink-500 hover:text-pink-400 p-1.5 transition-transform active:scale-75 bg-black/20 rounded-full backdrop-blur-sm">
                      <Heart size={18} className={activeChannel && favorites.includes(activeChannel.name) ? "fill-pink-500" : "fill-none"} />
                    </button>
                  </div>
                </div>

                <div className={`flex flex-col gap-2 ${pointerEventsClass} pb-1 w-full mt-auto relative z-10`}>
                  
                  <div className="relative flex items-center w-full mb-1 px-1">
                    <input 
                      type="range" 
                      min={isLiveStream ? seekRange.start : 0} 
                      max={isLiveStream ? seekRange.end : (duration || 100)} 
                      value={currentTime} 
                      onChange={(e) => {
                         const t = parseFloat(e.target.value);
                         setCurrentTime(t);
                         if (videoRef.current) videoRef.current.currentTime = t;
                      }} 
                      className="w-full h-1 rounded-lg appearance-none cursor-pointer outline-none transition-all drop-shadow-md" 
                      style={{ background: `linear-gradient(to right, #0084ff 0%, #0084ff ${progressPercent}%, rgba(255,255,255,0.3) ${progressPercent}%, rgba(255,255,255,0.3) 100%)` }} 
                    />
                  </div>

                  <div className="flex items-center justify-between text-sm text-gray-100 drop-shadow-md px-1">
                    {isLiveStream ? (
                      <div className="flex items-center font-bold tracking-wide text-sm">
                        {liveLatencyText === 'LIVE' ? (
                          <div onClick={seekToLiveEdge} className="flex items-center gap-1.5 cursor-pointer">
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
                              className="px-2 py-0.5 ml-1 rounded bg-gray-600/80 text-white text-[10px] md:text-xs font-bold uppercase tracking-wider transition-colors drop-shadow-md shadow-sm pointer-events-auto"
                            >
                              Go Live
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center font-normal tracking-wide text-xs md:text-sm text-[#e2e8f0]">
                        <span>{formatDuration(currentTime)}</span><span className="mx-1.5">/</span><span>{formatDuration(duration)}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-4 md:gap-5">
                      <button onClick={(e) => { e.stopPropagation(); setShowPlayerSettings(true); }} className="p-1 hover:text-[#0084ff] transition pointer-events-auto">
                        <svg className="w-[22px] h-[22px] md:w-6 md:h-6 text-white drop-shadow-md transition-transform duration-300 hover:rotate-45" viewBox="0 0 24 24" fill="currentColor">
                           <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49-.12-.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/>
                        </svg>
                      </button>

                      <button onClick={toggleFullscreen} className="p-1 hover:text-[#0084ff] transition drop-shadow-md">
                        {isFullscreen || isCSSFullscreen ? (
                          <svg className="w-[22px] h-[22px] md:w-6 md:h-6 text-white" viewBox="0 0 24 24"><path fill="currentColor" d="M18 7h-2V5h-2v4h4V7zM6 7v2h4V5H8v2H6zm12 10v-2h-4v4h2v-2h2zM6 17h2v2h2v-4H6v2z"/></svg>
                        ) : (
                          <svg className="w-[22px] h-[22px] md:w-6 md:h-6 text-white" viewBox="0 0 24 24"><path fill="currentColor" d="M20 5v4h-2V7h-2V5h4zM4 5h4v2H6v2H4V5zm16 14h-4v-2h2v-2h2v4zM4 19v-4h2v2h2v2H4z"/></svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {activeChannel && !isCSSFullscreen && (
            <div className="w-full landscape:w-[280px] md:w-[320px] lg:w-[350px] flex-1 landscape:flex-none md:flex-none bg-[#0a182b] border-t landscape:border-t-0 landscape:border-l md:border-t-0 md:border-l border-blue-400/10 p-3 md:p-4 shadow-inner flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <h3 className="text-blue-200/60 text-[11px] md:text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-pink-500 animate-pulse"></span> More in {activeChannel.category || 'Category'}
                </h3>
              </div>
              
              <div className="flex flex-row landscape:hidden md:hidden overflow-x-auto gap-3 pb-2 scroll-smooth no-scrollbar">
                {similarChannels.map((c, idx) => (
                  <div key={idx} className="flex-shrink-0 w-[90px]">
                    <ChannelCard channel={c} isActive={false} onClick={handleChannelSelect} />
                  </div>
                ))}
              </div>

              <div className="hidden landscape:grid md:grid grid-cols-2 gap-3 pb-2 overflow-y-auto scroll-smooth no-scrollbar content-start">
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
