import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { List as VirtualList } from 'react-window';
import { useApp } from '../contexts/AppContext';
import { getMappedName, isExcluded, escapeHtml, escapeRegExp, formatDuration, formatDurationLong, isMyMessageFast } from '../utils/helpers';
import { computeStatsForMessages } from '../utils/stats';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export default function ContentArea() {
  const { state, dispatch } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef(null);
  const chatContainerRef = useRef(null);

  const { activeView, activeChatName, chats, messages, media, myNames, excludeNames, aliasMap, chatLimit, mediaLimit, activeChatTab } = state;

  // --- Search logic ---
  const handleSearchInput = useCallback((e) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(val), 200);
  }, []);

  const validMessages = useMemo(() =>
    messages.filter(m => !isExcluded(getMappedName(m.threadName, aliasMap), getMappedName(m.sender, aliasMap), excludeNames)),
    [messages, aliasMap, excludeNames]
  );

  const searchResults = useMemo(() => {
    const q = debouncedQuery.toLowerCase().trim();
    if (!q) return validMessages.slice(0, 200);
    return validMessages.filter(m =>
      m.content.toLowerCase().includes(q) ||
      getMappedName(m.sender, aliasMap).toLowerCase().includes(q) ||
      getMappedName(m.threadName, aliasMap).toLowerCase().includes(q)
    );
  }, [debouncedQuery, validMessages, aliasMap]);

  // --- Chat data ---
  const chatData = activeChatName ? chats[activeChatName] : null;

  // Auto-scroll chat
  useEffect(() => {
    if (activeView === 'chat' && chatContainerRef.current) {
      setTimeout(() => {
        if (chatContainerRef.current) chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }, 50);
    }
  }, [activeView, activeChatName, chatLimit]);

  // --- Export functions ---
  const exportTxt = useCallback(() => {
    if (!chatData) return;
    const lines = [
      `CHAT HISTORY: ${activeChatName}`,
      `Exported on: ${new Date().toLocaleString()}`,
      `Total Messages: ${chatData.total}\n`,
      '--------------------------------------------------\n'
    ];
    const myNamesLower = myNames.map(n => n.toLowerCase());
    [...chatData.list].reverse().forEach(msg => {
      const mappedSender = getMappedName(msg.sender, aliasMap);
      const isMe = isMyMessageFast(msg.sender, myNamesLower, aliasMap);
      lines.push(`[${msg.dateStr}] ${isMe ? 'ME' : mappedSender}:`);
      if (msg.reactions && msg.reactions.length > 0) lines.push(`Reactions: ${msg.reactions.join(', ')}`);
      lines.push(msg.content);
      lines.push('');
    });
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `Chat_${activeChatName.replace(/[^a-z0-9]/gi, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [chatData, activeChatName, aliasMap, myNames]);

  const excludeParticipant = useCallback((name) => {
    if (!name) return;
    if (!confirm(`Are you sure you want to permanently exclude "${name}" from all calculations?`)) return;
    dispatch({ type: 'EXCLUDE_NAME', payload: name });
    setTimeout(() => {
      dispatch({ type: 'RECALCULATE' });
    }, 50);
  }, [dispatch]);

  const removeResource = useCallback((sourceType) => {
    if (!activeChatName) return;
    if (!confirm(`Are you sure you want to delete all "${sourceType}" records for "${activeChatName}"?`)) return;
    dispatch({ type: 'DELETE_CHAT_RESOURCE', payload: { chatName: activeChatName, source: sourceType } });
    setTimeout(() => dispatch({ type: 'RECALCULATE' }), 50);
  }, [activeChatName, dispatch]);

  const separateResource = useCallback((sourceType) => {
    if (!activeChatName) return;
    const newName = prompt(`Enter a new distinct name to separate the "${sourceType}" records into:`, `${activeChatName} (Separated)`);
    if (!newName || newName.trim() === '') return;
    
    dispatch({ type: 'SEPARATE_CHAT_RESOURCE', payload: { chatName: activeChatName, source: sourceType, newChatName: newName.trim() } });
    setTimeout(() => {
      dispatch({ type: 'RECALCULATE' });
    }, 50);
  }, [activeChatName, dispatch]);

  const deleteChat = useCallback(() => {
    if (!activeChatName) return;
    if (!confirm(`Are you sure you want to permanently delete ALL records for "${activeChatName}" from memory?`)) return;
    dispatch({ type: 'DELETE_CHAT', payload: activeChatName });
    setTimeout(() => dispatch({ type: 'RECALCULATE' }), 50);
  }, [activeChatName, dispatch]);

  // Subtitle for groups
  const subtitle = chatData?.isGroup ? `Members: ${Array.from(chatData.participants).join(', ')}` : null;

  // Title
  const getTitle = () => {
    if (['chat', 'chatMedia', 'chatStats', 'chatManage'].includes(activeView)) return activeChatName || 'Chat';
    if (activeView === 'directory') return 'Chat Directory';
    return 'Global Search Results';
  };

  // Show chat tabs?
  const showChatTabs = ['chat', 'chatMedia', 'chatStats', 'chatManage'].includes(activeView);

  // --- Directory data ---
  const getFilteredChats = () => {
    let filteredChats = Object.entries(chats);
    if (state.sidebarFilter === 'direct') filteredChats = filteredChats.filter(([, data]) => !data.isGroup);
    else if (state.sidebarFilter === 'group') filteredChats = filteredChats.filter(([, data]) => data.isGroup);
    filteredChats.sort(([, a], [, b]) => b.total - a.total);
    return filteredChats;
  };

  // --- Media data ---
  const chatMedia = useMemo(() => {
    if (!activeChatName) return [];
    return media.filter(m =>
      getMappedName(m.threadName, aliasMap) === activeChatName &&
      !isExcluded(activeChatName, getMappedName(m.sender, aliasMap), excludeNames)
    );
  }, [media, activeChatName, aliasMap, excludeNames]);

  const globalMedia = useMemo(() =>
    media.filter(m => !isExcluded(getMappedName(m.threadName, aliasMap), getMappedName(m.sender, aliasMap), excludeNames)),
    [media, aliasMap, excludeNames]
  );

  // --- Stats ---
  const chatStatsData = useMemo(() => {
    if (!chatData) return null;
    return computeStatsForMessages(chatData.list, aliasMap);
  }, [chatData, aliasMap]);

  const globalStatsData = useMemo(() => {
    return computeStatsForMessages(validMessages, aliasMap);
  }, [validMessages, aliasMap]);

  return (
    <div className="content-area">
      {/* Top Bar */}
      <div className="top-bar">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="view-title">{getTitle()}</div>
          {subtitle && <div className="view-subtitle" style={{ display: 'block' }}>{subtitle}</div>}
        </div>
        <div className="search-container">
          <input
            type="text"
            className="search-input"
            placeholder="Search messages..."
            disabled={messages.length === 0}
            value={searchQuery}
            onChange={handleSearchInput}
            onFocus={() => { if (activeView !== 'search') dispatch({ type: 'SET_VIEW', payload: 'search' }); }}
          />
        </div>
        <div className="export-buttons">
          {showChatTabs && (
            <>
              <button className="btn" onClick={exportTxt}>Export TXT</button>
              <button className="btn" onClick={() => dispatch({ type: 'SHOW_EBOOK_MODAL', payload: { show: true, targetChat: activeChatName } })}>Print / PDF</button>
            </>
          )}
          {activeView === 'directory' && (
            <button className="btn btn-primary" onClick={() => window.print()}>🖨️ Print Leaderboard</button>
          )}
        </div>
      </div>

      {/* Chat Tabs */}
      {showChatTabs && (
        <div className="chat-tabs">
          <button
            className={`tab ${activeChatTab === 'messages' ? 'active' : ''}`}
            onClick={() => { dispatch({ type: 'SET_CHAT_TAB', payload: 'messages' }); dispatch({ type: 'SET_VIEW', payload: 'chat' }); }}
          >Messages</button>
          <button
            className={`tab ${activeChatTab === 'media' ? 'active' : ''}`}
            onClick={() => { dispatch({ type: 'SET_CHAT_TAB', payload: 'media' }); dispatch({ type: 'SET_VIEW', payload: 'chatMedia' }); dispatch({ type: 'RESET_MEDIA_LIMIT' }); }}
          >Media / Files</button>
          <button
            className={`tab ${activeChatTab === 'stats' ? 'active' : ''}`}
            onClick={() => { dispatch({ type: 'SET_CHAT_TAB', payload: 'stats' }); dispatch({ type: 'SET_VIEW', payload: 'chatStats' }); }}
          >Insights & Stats</button>
          <button
            className={`tab ${activeChatTab === 'manage' ? 'active' : ''}`}
            onClick={() => { dispatch({ type: 'SET_CHAT_TAB', payload: 'manage' }); dispatch({ type: 'SET_VIEW', payload: 'chatManage' }); }}
          >⚙️ Manage Data</button>
        </div>
      )}

      {/* Views */}
      <div className="views-container">
        {/* Search View */}
        <div className={`view-section ${activeView === 'search' ? 'active' : ''}`}>
          <div className="results-list">
            {searchResults.length === 0 ? (
              <div style={{ textAlign: 'center', marginTop: 50, color: 'gray' }}>
                {messages.length === 0 ? 'Load folder or files to begin.' : 'No results'}
              </div>
            ) : (
              <>
                {searchResults.slice(0, 500).map((msg, i) => {
                  const mSender = getMappedName(msg.sender, aliasMap);
                  const mThread = getMappedName(msg.threadName, aliasMap);
                  let contentHtml = escapeHtml(msg.content);
                  if (searchQuery.trim()) {
                    contentHtml = contentHtml.replace(
                      new RegExp(`(${escapeRegExp(searchQuery)})`, 'gi'),
                      '<span class="highlight">$1</span>'
                    );
                  }
                  return (
                    <div
                      key={i}
                      className="result-item"
                      onClick={() => dispatch({ type: 'SET_ACTIVE_CHAT', payload: mThread })}
                    >
                      <div className="result-meta">
                        <span style={{ color: 'var(--accent-primary)', fontWeight: 'bold' }}>{mSender}</span>
                        <span>•</span>
                        <span>{mThread}</span>
                      </div>
                      <div dangerouslySetInnerHTML={{ __html: contentHtml }} />
                    </div>
                  );
                })}
                {searchResults.length > 500 && (
                  <div style={{ textAlign: 'center', padding: 10, color: 'gray' }}>
                    ...and {searchResults.length - 500} more results
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Chat View */}
        <div className={`view-section ${activeView === 'chat' ? 'active' : ''}`}>
          {chatData && chatData.list.length > chatLimit && (
            <button className="btn-load-more" onClick={() => dispatch({ type: 'LOAD_MORE_CHAT' })}>
              Load Older Messages
            </button>
          )}
          <div className="chat-view" ref={chatContainerRef}>
            {chatData && (() => {
              const visibleMsgs = chatData.list.slice(-chatLimit);
              const myNamesLower = myNames.map(n => n.toLowerCase());
              const ChatRow = ({ index, style }) => {
                const msg = visibleMsgs[index];
                const mappedSender = getMappedName(msg.sender, aliasMap);
                const isMe = isMyMessageFast(msg.sender, myNamesLower, aliasMap);
                return (
                  <div style={style}>
                    <div className={`chat-bubble ${isMe ? 'sent' : 'received'}`}>
                      {!isMe && <span className="bubble-sender">{mappedSender}</span>}
                      {msg.content}
                      {msg.reactions && msg.reactions.length > 0 && (
                        <div className="reaction-container">
                          {msg.reactions.map((r, j) => (
                            <span key={j} className="reaction-badge">{r}</span>
                          ))}
                        </div>
                      )}
                      <span className="bubble-date">{msg.dateStr}</span>
                    </div>
                  </div>
                );
              };
              // Use virtualized list for large chats, regular render for small ones
              if (visibleMsgs.length > 200) {
                return (
                  <VirtualList
                    height={600}
                    itemCount={visibleMsgs.length}
                    itemSize={80}
                    width="100%"
                    initialScrollOffset={visibleMsgs.length * 80}
                  >
                    {ChatRow}
                  </VirtualList>
                );
              }
              return visibleMsgs.map((msg, i) => {
                const mappedSender = getMappedName(msg.sender, aliasMap);
                const isMe = isMyMessageFast(msg.sender, myNamesLower, aliasMap);
                return (
                  <div key={i} className={`chat-bubble ${isMe ? 'sent' : 'received'}`}>
                    {!isMe && <span className="bubble-sender">{mappedSender}</span>}
                    {msg.content}
                    {msg.reactions && msg.reactions.length > 0 && (
                      <div className="reaction-container">
                        {msg.reactions.map((r, j) => (
                          <span key={j} className="reaction-badge">{r}</span>
                        ))}
                      </div>
                    )}
                    <span className="bubble-date">{msg.dateStr}</span>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* Chat Media View */}
        <div className={`view-section ${activeView === 'chatMedia' ? 'active' : ''}`}>
          <div className="gallery-grid">
            {chatMedia.length === 0 ? (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'gray' }}>No media found.</div>
            ) : (
              chatMedia.slice(0, mediaLimit).map((item, i) => (
                <div key={i} className="gallery-item" onClick={() => window.open(item.url, '_blank')}>
                  {item.type === 'image' ? (
                    <>
                      <img src={item.url} className="gallery-img" loading="lazy" alt="" />
                      <div className="gallery-overlay">
                        {getMappedName(item.threadName, aliasMap)}<br />{item.dateStr}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="file-icon">📄</div>
                      <div className="file-name">{item.filename}</div>
                      <div className="gallery-overlay">Click to Download</div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
          {chatMedia.length > mediaLimit && (
            <button className="btn-load-more" onClick={() => dispatch({ type: 'LOAD_MORE_MEDIA' })}>
              Load More
            </button>
          )}
        </div>

        {/* Chat Stats View */}
        <div className={`view-section ${activeView === 'chatStats' ? 'active' : ''}`}>
          <div className="stats-dashboard">
            <StatsDisplay data={chatStatsData} />
          </div>
        </div>

        {/* Chat Manage View */}
        <div className={`view-section ${activeView === 'chatManage' ? 'active' : ''}`}>
          <div className="manage-dashboard" style={{ overflowY: 'auto', height: '100%', padding: '1rem', maxWidth: '800px', margin: '0 auto' }}>
            
            {/* Resources Section */}
            <div className="manage-card" style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '1.5rem', marginBottom: '1.5rem' }}>
              <h3 style={{ marginTop: 0, marginBottom: '1rem', color: 'var(--accent-primary)', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
                Constituent Resources
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                This chat is compiled from the following parsed resources. You can selectively delete subsets of data if you imported something by mistake.
              </p>
              
              {chatData && (() => {
                const resourceMap = {};
                chatData.list.forEach(msg => {
                  const plat = msg.platform || msg._source || 'unknown';
                  if (!resourceMap[plat]) resourceMap[plat] = { count: 0, first: Infinity, last: 0 };
                  resourceMap[plat].count++;
                  if (msg.timestamp > 0) {
                    if (msg.timestamp < resourceMap[plat].first) resourceMap[plat].first = msg.timestamp;
                    if (msg.timestamp > resourceMap[plat].last) resourceMap[plat].last = msg.timestamp;
                  }
                });
                
                return Object.entries(resourceMap).map(([source, stats]) => {
                  const formatTs = (ts) => ts === Infinity || ts === 0 ? 'Unknown Date' : new Date(ts).toLocaleDateString();
                  return (
                    <div key={source} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '6px', marginBottom: '0.5rem' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '0.2rem' }}>{source}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          {stats.count.toLocaleString()} messages • {formatTs(stats.first)} - {formatTs(stats.last)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', background: '#333' }} onClick={() => separateResource(source)}>
                          Separate
                        </button>
                        <button className="btn btn-danger" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }} onClick={() => removeResource(source)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                });
              })()}
              
              <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
                <button className="btn btn-danger" onClick={deleteChat}>
                  🗑️ Delete Entire Chat History
                </button>
              </div>
            </div>

            {/* Participants Section */}
            <div className="manage-card" style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '1.5rem' }}>
              <h3 style={{ marginTop: 0, marginBottom: '1rem', color: 'var(--accent-secondary)', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
                Exclude Participants
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                Exclude specific names from this chat (and globally). Useful for filtering out system messages or duplicate spellings.
              </p>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '0.5rem' }}>
                {chatData && Array.from(chatData.participants).map(p => (
                  <div key={p} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '4px' }}>
                    <span style={{ fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p}>{p}</span>
                    <button className="btn" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', background: '#333' }} onClick={() => excludeParticipant(p)}>
                      Exclude
                    </button>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* Directory View */}
        <div className={`view-section ${activeView === 'directory' ? 'active' : ''}`}>
          <div className="directory-filters" style={{ padding: '1rem 1.5rem 0', display: 'flex', gap: '10px' }}>
            {['all', 'direct', 'group'].map(f => (
              <button
                key={f}
                className={`sidebar-tab ${state.sidebarFilter === f ? 'active' : ''}`}
                style={{ flex: '0 1 auto', padding: '6px 16px', border: '1px solid var(--border-color)', background: state.sidebarFilter === f ? 'rgba(59, 130, 246, 0.1)' : 'var(--panel-bg)' }}
                onClick={() => dispatch({ type: 'SET_SIDEBAR_FILTER', payload: f })}
              >
                {f === 'all' ? 'All Chats' : f === 'direct' ? 'Direct Only' : 'Groups Only'}
              </button>
            ))}
          </div>
          <div className="directory-grid">
            {getFilteredChats().length === 0 ? (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'gray', width: '100%' }}>
                No chats match your filters.
              </div>
            ) : (
              getFilteredChats().map(([name, data], index) => {
                let durationStr = 'Unknown';
                if (data.firstMsg !== Infinity && data.lastMsg !== 0) {
                  durationStr = formatDurationLong(data.lastMsg - data.firstMsg);
                }
                return (
                  <div
                    key={name}
                    className="directory-card"
                    onClick={() => dispatch({ type: 'SET_ACTIVE_CHAT', payload: name })}
                  >
                    <div className="dir-card-header">
                      <div className="dir-card-title" title={name}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginRight: 5 }}>#{index + 1}</span>
                        {name}
                      </div>
                      {data.isGroup && <div className="dir-card-badge">Group</div>}
                    </div>
                    <div className="dir-card-stats">
                      <span className="badge-sent">Sent: {data.sent}</span>
                      <span className="badge-recv">Received: {data.received}</span>
                    </div>
                    <div className="dir-card-stats" style={{ marginTop: 5, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 6 }}>
                      <span style={{ color: 'var(--text-muted)' }}>⏳ {durationStr}</span>
                      <span style={{ color: 'var(--text-muted)' }}>Total: {data.total}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Stats display sub-component
function StatsDisplay({ data }) {
  if (!data) return <div style={{ color: 'var(--text-muted)' }}>Not enough timestamp data for stats.</div>;

  return (
    <>
      <div className="stats-row">
        <div className="stats-card">
          <h3>🔥 Longest Streak</h3>
          <div style={{ fontSize: '2.5rem', color: 'var(--success)', fontWeight: 'bold', textAlign: 'center' }}>
            {data.maxStreak} Days
          </div>
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            Consecutive messaging days
          </div>
        </div>
        <div className="stats-card">
          <h3>🕒 Busiest Time</h3>
          <div style={{ fontSize: '1.5rem', color: 'var(--accent-primary)', fontWeight: 'bold', textAlign: 'center', marginTop: 10 }}>
            {data.busiestHour.split('(')[0]}
          </div>
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 5 }}>
            ({data.busiestHour.split('(')[1]}
          </div>
        </div>
        <div className="stats-card">
          <h3>🗓️ Total Active Days</h3>
          <div style={{ fontSize: '2.5rem', color: 'var(--accent-secondary)', fontWeight: 'bold', textAlign: 'center' }}>
            {data.totalDaysActive}
          </div>
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            Days with at least 1 message
          </div>
        </div>
      </div>
      <div className="stats-card">
        <h3>⚡ Response Times</h3>
        {data.responseStats.length > 0 ? (
          data.responseStats.map((s, i) => (
            <div key={i} style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: 'white' }}>{s.sender}</div>
              <div className="stat-detail-row">
                <span>Average Response</span>
                <span className="stat-highlight">{formatDuration(s.avgMs)}</span>
              </div>
              <div className="stat-detail-row">
                <span>Fastest Response</span>
                <span className="stat-highlight">{formatDuration(s.fastestMs)}</span>
              </div>
              <div className="stat-detail-row">
                <span>Slowest Response</span>
                <span className="stat-slow">{formatDuration(s.slowestMs)}</span>
              </div>
            </div>
          ))
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Not enough back-and-forth data within 3-day windows.
          </div>
        )}
      </div>
    </>
  );
}
