'use client';

import { useState, useEffect } from 'react';
import VideoPlayer from '../components/VideoPlayer';

export default function Home() {
  const [channels, setChannels] = useState([]);
  const [currentStream, setCurrentStream] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch your channel list (standard unauthenticated fetching)
    const fetchChannels = async () => {
      try {
        const response = await fetch('YOUR_CHANNEL_API_ENDPOINT');
        const data = await response.json();
        setChannels(data);
      } catch (error) {
        console.error('Failed to fetch channels', error);
      } finally {
        setLoading(false);
      }
    };

    fetchChannels();
  }, []);

  return (
    <main className="min-h-screen bg-gray-950 text-white flex">
      {/* Sidebar */}
      <aside className="w-80 bg-gray-900 overflow-y-auto border-r border-gray-800 hidden md:block">
        <div className="p-4 border-b border-gray-800 font-bold text-xl">
          Channels
        </div>
        {loading ? (
          <div className="p-4 text-gray-400">Loading channels...</div>
        ) : (
          <ul>
            {channels.map((channel, index) => (
              <li 
                key={index}
                onClick={() => setCurrentStream(channel.url)}
                className="p-4 hover:bg-gray-800 cursor-pointer flex items-center transition-colors"
              >
                <img 
                  src={channel.logo || 'https://via.placeholder.com/50'} 
                  alt={channel.name} 
                  className="w-12 h-12 rounded-md mr-4 object-cover"
                />
                <span className="font-medium">{channel.name}</span>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {/* Main Content */}
      <section className="flex-1 flex flex-col p-6 items-center justify-center">
        {currentStream ? (
          <div className="w-full">
            <h2 className="text-2xl mb-6 font-semibold text-center">Now Playing</h2>
            <VideoPlayer streamUrl={currentStream} />
          </div>
        ) : (
          <div className="text-gray-500 text-lg flex flex-col items-center">
            <svg className="w-16 h-16 mb-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Select a channel from the sidebar to begin playback.
          </div>
        )}
      </section>
    </main>
  );
}
