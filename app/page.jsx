'use client';

import React, { useState, useEffect, useRef } from 'react';
import 'shaka-player/dist/controls.css';
import { Search, X, ArrowLeft, PlayCircle, Activity } from 'lucide-react';

export default function App() {
  // SSR Safety Check
  const [isMounted, setIsMounted] = useState(false);

  // Data States
  const [channels, setChannels] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // UI States
  const [activeChannel, setActiveChannel] = useState(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  // Refs
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const uiRef = useRef(null);
  const tokenRef = useRef("");

  // 1. Mark as Mounted
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 2. Fetch API Data
  useEffect(() => {
    if (!isMounted) return;

    const fetchInitialData = async () => {
      try {
        // Fetch Token
        const tokenRes = await fetch('https://allinonereborn2.online/jstrweb2/cookies.json');
        const tokenData = await tokenRes.json();
        const extractedCookie = tokenData.find(item => item.cookie)?.cookie;
        if (extractedCookie) tokenRef.current = extractedCookie;

        // Fetch Channels
        const channelRes = await fetch(`https://raw.githubusercontent.com/live4wap/links/refs/heads/main/jiomb?t=${new Date().getTime()}`);
        const channelData = await channelRes.json();
        
        // Extract Categories
        const uniqueCategories = ['All', ...Array.from(new Set(channelData.map(c => c.category).filter(Boolean)))];
        
        setChannels(channelData);
        setCategories(uniqueCategories);
        setIsLoading(false);
      } catch (error) {
        console.error("API Fetch Error:", error);
        setIsLoading(false);
      }
    };

    fetchInitialData();
  }, [isMounted]);

  // 3. Initialize Shaka Player Engine (Runs Once)
  useEffect(() => {
    if (!isMounted || !videoRef.current || playerRef.current) return;

    const initPlayer = async () => {
      const shaka = await import('shaka-player/dist/shaka-player.ui');
      shaka.polyfill.installAll();

      if (!shaka.Player.isBrowserSupported()) return;

      const player = new shaka.Player(videoRef.current);
      const ui = new shaka.ui.Overlay(player, containerRef.current, videoRef.current);
      
      ui.configure({
        controlPanelElements: [
          'play_pause', 'time_and_duration', 'spacer', 'mute', 
          'volume', 'picture_in_picture', 'quality', 'fullscreen'
        ],
        addSeekBar: true
      });

      // Token Injection Filter
      player.getNetworkingEngine().registerRequestFilter((type, request) => {
        const isManifest = type === shaka.net.NetworkingEngine.RequestType.MANIFEST;
        const isSegment = type === shaka.net.NetworkingEngine.RequestType.SEGMENT;

        if (isManifest || isSegment) {
          let uri = request.uris[0];
          if (tokenRef.current && !uri.includes('hdnea')) {
             const separator = uri.includes('?') ? '&' : '?';
             const cleanToken = tokenRef.current.startsWith('?') ? tokenRef.current.substring(1) : tokenRef.current;
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

  // 4. Handle Video Playback when a channel is clicked
  useEffect(() => {
    if (!activeChannel || !playerRef.current) return;

    const playStream = async () => {
      try {
        await playerRef.current.unload();
        
        let drmConfig = { clearKeys: {} };
        if (activeChannel.keyId && activeChannel.key && activeChannel.keyId !== "null" && activeChannel.key !== "null") {
          drmConfig.clearKeys[activeChannel.keyId] = activeChannel.key;
        }

        playerRef.current.configure({
          drm: drmConfig,
          manifest: { dash: { ignoreDrmInfo: false } },
          streaming: { bufferingGoal: 5 }
        });

        await playerRef.current.load(activeChannel.url);
      } catch (error) {
        console.error("Playback error:", error);
      }
    };

    playStream();
  }, [activeChannel]);

  // Prevent SSR Build crashes
  if (!isMounted) return <div className="h-screen bg-black" />;

  // Data Filtering
  const filteredChannels = channels.filter(c => {
    const matchCategory = activeCategory === 'All' || c.category === activeCategory;
    const matchSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch;
  });

  const relatedChannels = activeChannel 
    ? channels.filter(c => c.category === activeChannel.category && c.id !== activeChannel.id)
    : [];

  // Loading Screen
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#050505] text-cyan-500 flex-col gap-5">
         <Activity size={56} className="animate-spin" />
         <p className="font-semibold tracking-widest uppercase text-sm">Initializing Engine...</p>
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
        
        {/* TOP NAVIGATION */}
        <header className="bg-[#111] border-b border-[#222] h-16 flex items-center justify-between px-4 z-20 flex-none shadow-md">
          <div className="flex items-center gap-3">
            {activeChannel && (
              <button 
                onClick={() => setActiveChannel(null)} 
                className="md:hidden text-gray-400 hover:text-white p-1 rounded-full hover:bg-gray-800 transition"
              >
                <ArrowLeft size={24} />
              </button>
            )}
            <h1 className="text-xl md:text-2xl font-black bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent tracking-wide">
              Live @Ayush@8481
            </h1>
          </div>
          
          {/* Top Right Corner Search */}
          <div className="flex items-center">
            {searchOpen ? (
              <div className="flex items-center bg-gray-900 border border-cyan-500/50 rounded-full px-3 py-1.5 shadow-[0_0_10px_rgba(6,182,212,0.2)]">
                <Search size={16} className="text-cyan-500 mr-2" />
                <input 
                  autoFocus
                  type="text" 
                  placeholder="Search channels..." 
                  className="bg-transparent border-none outline-none text-sm w-32 md:w-64 text-white placeholder-gray-500"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button onClick={() => { setSearchOpen(false); setSearchQuery(''); }} className="text-gray-500 hover:text-white ml-2">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button onClick={() => setSearchOpen(true)} className="p-2 rounded-full bg-gray-900 text-gray-400 hover:text-cyan-400 hover:bg-gray-800 transition-colors">
                <Search size={20} />
              </button>
            )}
          </div>
        </header>

        {/* MAIN BODY AREA */}
        <main className="flex flex-1 overflow-hidden relative">
          
          {/* LEFT PANE: Channels & Categories (Grid or Sidebar depending on context) */}
          <div className={`flex flex-col bg-[#0f0f0f] border-r border-[#222] transition-all duration-300 z-10
              ${activeChannel 
                ? 'hidden md:flex md:w-80 lg:w-96' // Desktop Sidebar Mode
                : 'flex w-full'                    // Fullscreen Grid Mode
              }`}
          >
            {/* Horizontal Categories Row */}
            <div className="flex gap-2 overflow-x-auto scrollbar-hide px-4 py-3 bg-[#111] shadow-md flex-none border-b border-[#222]">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-4 py-1.5 rounded-full whitespace-nowrap text-sm font-medium transition-all duration-300 border
                    ${activeCategory === cat 
                      ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.3)]' 
                      : 'bg-transparent text-gray-400 border-gray-800 hover:border-gray-600 hover:text-white'
                    }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Channels List / Grid */}
            <div className="flex-1 overflow-y-auto scrollbar-hide p-4">
              {filteredChannels.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-600">
                  <Search size={48} className="mb-4 opacity-20" />
                  <p>No channels found</p>
                </div>
              ) : (
                <div className={`${activeChannel ? 'flex flex-col gap-2' : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4'}`}>
                  {filteredChannels.map(channel => (
                    <div 
                      key={channel.id}
                      onClick={() => setActiveChannel(channel)}
                      className={`cursor-pointer rounded-xl overflow-hidden transition-all duration-300 border group
                        ${activeChannel?.id === channel.id 
                            ? 'border-cyan-500 bg-cyan-900/20 shadow-[inset_4px_0_0_#06b6d4]' 
                            : 'border-transparent bg-gray-900/40 hover:bg-gray-800 hover:border-gray-700'}
                        ${activeChannel ? 'flex items-center p-2 gap-3' : 'flex flex-col'}`
                      }
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src={channel.logo} 
                        onError={(e) => { e.target.src = 'https://via.placeholder.com/150?text=TV' }}
                        className={`${activeChannel ? 'w-16 h-12 object-contain bg-black rounded-lg' : 'w-full aspect-video object-cover bg-black opacity-90 group-hover:opacity-100 transition-opacity'}`}
                      />
                      <div className={`p-2 flex-1 min-w-0 ${activeChannel ? 'p-0' : 'p-3'}`}>
                        <h3 className={`font-semibold truncate text-gray-200 group-hover:text-white ${activeChannel ? 'text-sm' : 'text-sm md:text-base'}`}>{channel.name}</h3>
                        <p className={`text-xs text-gray-500 truncate mt-0.5 ${activeChannel ? 'text-[10px]' : ''}`}>{channel.category}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT PANE: Video Player & Related Channels */}
          <div className={`flex flex-col bg-black overflow-y-auto scrollbar-hide w-full transition-all duration-300
              ${activeChannel ? 'flex flex-1' : 'hidden'}`}
          >
            {/* Shaka Video Player Container */}
            <div className="w-full bg-black relative shadow-2xl border-b border-[#222]">
              <div ref={containerRef} className="mx-auto w-full max-w-6xl aspect-video relative">
                <video ref={videoRef} className="w-full h-full object-contain bg-black" autoPlay playsInline />
              </div>
            </div>

            {activeChannel && (
              <div className="max-w-6xl mx-auto w-full">
                {/* Active Channel Details */}
                <div className="p-4 md:p-8 flex items-start gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={activeChannel.logo} className="w-16 h-16 md:w-20 md:h-20 rounded-xl object-contain bg-white/5 border border-gray-800 p-1 shadow-lg" />
                  <div>
                    <h2 className="text-xl md:text-3xl font-bold text-white tracking-tight">{activeChannel.name}</h2>
                    <span className="inline-block mt-2 px-3 py-1 bg-gray-900 border border-gray-700 text-cyan-400 text-[10px] md:text-xs font-semibold rounded-full uppercase tracking-wider shadow-sm">
                      {activeChannel.category}
                    </span>
                  </div>
                </div>

                {/* Related Channels (Scrollable Row) */}
                {relatedChannels.length > 0 && (
                  <div className="mt-2 px-4 md:px-8 pb-12">
                    <h3 className="text-lg font-bold text-gray-300 mb-4 flex items-center gap-2">
                      More in {activeChannel.category}
                    </h3>
                    <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-4 snap-x">
                      {relatedChannels.map(channel => (
                        <div 
                          key={channel.id}
                          onClick={() => {
                            setActiveChannel(channel);
                            window.scrollTo({ top: 0, behavior: 'smooth' }); // Scroll to player on mobile
                          }}
                          className="snap-start flex-none w-36 md:w-48 cursor-pointer group"
                        >
                          <div className="w-full aspect-video rounded-xl overflow-hidden border border-gray-800 bg-gray-900 group-hover:border-cyan-500 group-hover:shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={channel.logo} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-3">
                              <PlayCircle className="text-cyan-400 w-8 h-8" />
                            </div>
                          </div>
                          <h4 className="font-semibold text-sm mt-2 text-gray-400 group-hover:text-white truncate">{channel.name}</h4>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
