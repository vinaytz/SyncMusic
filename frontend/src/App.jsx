import { useState, useEffect, useRef } from 'react';
import {
  Music, Upload, Play, Pause, Radio, Copy, Check, Loader2, Users, LogIn, Plus, Wifi, WifiOff, Search, X, Disc3
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const API_URL = 'https://syncmusic-production.up.railway.app';
const WS_URL = 'wss://syncmusic-production.up.railway.app/';

export default function App() {
  // ─── State ───
  const [view, setView] = useState('home');       // home | create | join | room
  const [connected, setConnected] = useState(false);
  const [roomKey, setRoomKey] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [songName, setSongName] = useState('');

  // Create room form
  const [password, setPassword] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [musicSource, setMusicSource] = useState('upload'); // 'upload' | 'spotify'

  // Spotify search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState(null);

  // Join room form
  const [joinKey, setJoinKey] = useState('');
  const [joinPassword, setJoinPassword] = useState('');

  // Refs
  const socketRef = useRef(null);
  const audioRef = useRef(new Audio());

  // ─── WebSocket connection ───
  useEffect(() => {
    const socket = new WebSocket(WS_URL);
    socketRef.current = socket;

    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);

    socket.onmessage = (event) => {
      const { type, ...data } = JSON.parse(event.data);

      switch (type) {
        case 'ROOM_CREATED':
          setRoomKey(data.roomKey);
          setView('room');
          break;

        case 'JOIN_SUCCESS':
          audioRef.current.src = data.musicUrl;
          setSongName(data.musicUrl.split('/').pop().split('?')[0]);
          setView('room');
          break;

        case 'SYNC_CONTROL':
          audioRef.current.currentTime = data.time;
          if (data.action === 'PLAY') {
            audioRef.current.play();
            setIsPlaying(true);
          } else {
            audioRef.current.pause();
            setIsPlaying(false);
          }
          break;

        case 'ERROR':
          alert(data.message);
          break;
      }
    };

    return () => {
      socket.close();
      audioRef.current.pause();
    };
  }, []);

  const send = (payload) => {
    const ws = socketRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  };

  // ─── Upload & Create Room ───
  const handleCreate = async () => {
    if (!password) return;

    if (musicSource === 'spotify') {
      // Spotify: use the preview URL directly
      if (!selectedTrack?.previewUrl) return;
      setSongName(`${selectedTrack.name} — ${selectedTrack.artist}`);
      send({ type: 'CREATE_ROOM', password, musicUrl: selectedTrack.previewUrl });
      return;
    }

    // Upload: upload file to ImageKit
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('music', file);
      const res = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData });
      const { url } = await res.json();
      if (!url) throw new Error('Upload failed');
      setSongName(file.name);
      send({ type: 'CREATE_ROOM', password, musicUrl: url });
    } catch (err) {
      alert('Upload failed. Try again.');
    } finally {
      setUploading(false);
    }
  };

  // ─── Spotify search ───
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`${API_URL}/spotify/search?q=${encodeURIComponent(searchQuery)}`);
      const { tracks } = await res.json();
      setSearchResults(tracks || []);
    } catch {
      alert('Search failed');
    } finally {
      setSearching(false);
    }
  };

  // ─── Join Room ───
  const handleJoin = () => {
    if (!joinKey || !joinPassword) return;
    send({ type: 'JOIN_ROOM', roomKey: joinKey, password: joinPassword });
  };

  // ─── Controls ───
  const handlePlay = () => send({ type: 'CONTROL', action: 'PLAY' });
  const handlePause = () => send({ type: 'CONTROL', action: 'PAUSE', time: audioRef.current.currentTime });

  const copyKey = () => {
    navigator.clipboard.writeText(roomKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ─── Views ───
  if (view === 'room') {
    return (
      <Shell connected={connected}>
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10">
              <Radio className="h-6 w-6 text-violet-400" />
            </div>
            <CardTitle>Live Room</CardTitle>
            <CardDescription>Everyone hears the same thing, at the same time.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-5">
            {/* Room key */}
            <div className="flex w-full items-center gap-2 rounded-lg bg-zinc-800 px-4 py-3">
              <span className="text-xs text-zinc-500 uppercase tracking-wider">Room Key</span>
              <code className="ml-auto font-mono text-sm text-violet-400">{roomKey || joinKey}</code>
              <button onClick={copyKey} className="text-zinc-500 hover:text-white transition-colors cursor-pointer">
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>

            {/* Song name */}
            {songName && (
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Music className="h-4 w-4" />
                <span className="truncate max-w-[200px]">{songName}</span>
              </div>
            )}

            {/* Play / Pause */}
            <Button
              variant="primary"
              size="lg"
              className="w-40 rounded-full"
              onClick={isPlaying ? handlePause : handlePlay}
            >
              {isPlaying ? <><Pause className="h-5 w-5" /> Pause</> : <><Play className="h-5 w-5" /> Play</>}
            </Button>

            <p className="text-xs text-zinc-600">Open in multiple tabs / devices to test sync</p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (view === 'create') {
    const canCreate = password && connected && !uploading &&
      (musicSource === 'upload' ? !!file : !!selectedTrack?.previewUrl);

    return (
      <Shell connected={connected}>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-violet-400" /> Create Room</CardTitle>
            <CardDescription>Pick a song and set a password. Share the key with friends.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">

            {/* ── Source tabs ── */}
            <div className="flex rounded-lg bg-zinc-800 p-1 gap-1">
              <button
                onClick={() => { setMusicSource('upload'); setSelectedTrack(null); }}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                  musicSource === 'upload' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Upload className="h-4 w-4" /> Upload
              </button>
              <button
                onClick={() => { setMusicSource('spotify'); setFile(null); }}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                  musicSource === 'spotify' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Disc3 className="h-4 w-4" /> Spotify
              </button>
            </div>

            {/* ── Upload tab ── */}
            {musicSource === 'upload' && (
              <label className="group flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-zinc-700 p-6 cursor-pointer hover:border-violet-500/50 transition-colors">
                <Upload className="h-8 w-8 text-zinc-500 group-hover:text-violet-400 transition-colors" />
                <span className="text-sm text-zinc-400">
                  {file ? file.name : 'Click to select an MP3 file'}
                </span>
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files[0])}
                />
              </label>
            )}

            {/* ── Spotify tab ── */}
            {musicSource === 'spotify' && (
              <div className="flex flex-col gap-3">
                {/* Search bar */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Search for a song..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  />
                  <Button variant="outline" size="icon" onClick={handleSearch} disabled={searching}>
                    {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>

                {/* Selected track */}
                {selectedTrack && (
                  <div className="flex items-center gap-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
                    <img src={selectedTrack.cover} alt="" className="h-10 w-10 rounded object-cover" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{selectedTrack.name}</p>
                      <p className="text-xs text-zinc-400 truncate">{selectedTrack.artist}</p>
                    </div>
                    <button onClick={() => setSelectedTrack(null)} className="text-zinc-500 hover:text-white cursor-pointer">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {/* Results list */}
                {searchResults.length > 0 && !selectedTrack && (
                  <div className="max-h-60 overflow-y-auto rounded-lg border border-zinc-800 divide-y divide-zinc-800">
                    {searchResults.map((track) => (
                      <button
                        key={track.id}
                        onClick={() => { setSelectedTrack(track); setSearchResults([]); }}
                        disabled={!track.previewUrl}
                        className={`flex w-full items-center gap-3 p-3 text-left transition-colors ${
                          track.previewUrl
                            ? 'hover:bg-zinc-800 cursor-pointer'
                            : 'opacity-40 cursor-not-allowed'
                        }`}
                      >
                        <img src={track.cover} alt="" className="h-10 w-10 rounded object-cover" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{track.name}</p>
                          <p className="text-xs text-zinc-400 truncate">{track.artist}</p>
                        </div>
                        {!track.previewUrl && (
                          <span className="text-[10px] text-zinc-600 shrink-0">No preview</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {musicSource === 'spotify' && selectedTrack && (
                  <p className="text-xs text-zinc-500 text-center">
                    Spotify free tier provides 30-second preview clips
                  </p>
                )}
              </div>
            )}

            <Input
              type="password"
              placeholder="Room password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <Button
              variant="primary"
              onClick={handleCreate}
              disabled={!canCreate}
            >
              {uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</> : 'Create Room'}
            </Button>

            <Button variant="ghost" onClick={() => setView('home')}>← Back</Button>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (view === 'join') {
    return (
      <Shell connected={connected}>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><LogIn className="h-5 w-5 text-violet-400" /> Join Room</CardTitle>
            <CardDescription>Enter the room key and password shared by the host.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Input
              placeholder="Room key"
              value={joinKey}
              onChange={(e) => setJoinKey(e.target.value)}
            />
            <Input
              type="password"
              placeholder="Room password"
              value={joinPassword}
              onChange={(e) => setJoinPassword(e.target.value)}
            />
            <Button
              variant="primary"
              onClick={handleJoin}
              disabled={!joinKey || !joinPassword || !connected}
            >
              Join Room
            </Button>
            <Button variant="ghost" onClick={() => setView('home')}>← Back</Button>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  // ─── Home ───
  return (
    <Shell connected={connected}>
      <div className="flex flex-col items-center gap-2 mb-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/10 mb-2">
          <Music className="h-8 w-8 text-violet-400" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white">SyncMusic</h1>
        <p className="text-zinc-400 text-center max-w-xs">
          Listen to music together in perfect sync — no matter where you are.
        </p>
      </div>

      <div className="grid w-full max-w-md gap-4">
        <Card
          className="cursor-pointer hover:border-violet-500/40 transition-colors"
          onClick={() => setView('create')}
        >
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
              <Plus className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <p className="font-medium text-white">Create a Room</p>
              <p className="text-sm text-zinc-500">Upload a song or pick from Spotify</p>
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-violet-500/40 transition-colors"
          onClick={() => setView('join')}
        >
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
              <Users className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="font-medium text-white">Join a Room</p>
              <p className="text-sm text-zinc-500">Enter a key to listen with friends</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </Shell>
  );
}

// ─── Layout shell ───
function Shell({ connected, children }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 py-12">
      {/* Connection badge */}
      <div className="fixed top-4 right-4">
        <Badge variant={connected ? 'success' : 'destructive'}>
          {connected
            ? <><Wifi className="mr-1 h-3 w-3" /> Connected</>
            : <><WifiOff className="mr-1 h-3 w-3" /> Disconnected</>
          }
        </Badge>
      </div>
      {children}
    </div>
  );
}