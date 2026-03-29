import React, { useRef, useCallback } from 'react';
import { useApp } from '../contexts/AppContext';

export default function Sidebar() {
  const { state, dispatch, handleUpload, handleSave, handleLoad, handleClear } = useApp();
  const folderRef = useRef(null);
  const fileRef = useRef(null);

  const onFolderChange = useCallback((e) => {
    const files = Array.from(e.target.files);
    handleUpload(files);
    e.target.value = '';
  }, [handleUpload]);

  const onFileChange = useCallback((e) => {
    const files = Array.from(e.target.files);
    handleUpload(files);
    e.target.value = '';
  }, [handleUpload]);

  const onFilterChange = useCallback((e) => {
    dispatch({ type: 'SET_SEARCH_QUERY', payload: e.target.value });
  }, [dispatch]);

  // Get filtered chats
  const getFilteredChats = () => {
    let filteredChats = Object.entries(state.chats);
    if (state.sidebarFilter === 'direct') filteredChats = filteredChats.filter(([, data]) => !data.isGroup);
    else if (state.sidebarFilter === 'group') filteredChats = filteredChats.filter(([, data]) => data.isGroup);
    
    const query = state.searchQuery?.toLowerCase().trim();
    if (query) filteredChats = filteredChats.filter(([name]) => name.toLowerCase().includes(query));
    filteredChats.sort(([, a], [, b]) => b.total - a.total);
    return filteredChats;
  };

  const filteredChats = getFilteredChats();

  return (
    <aside className={`sidebar ${state.sidebarCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-content">
        {/* Config */}
        <details className="sidebar-config-details" open>
          <summary className="sidebar-config-summary">⚙️ CONFIGURATION</summary>
          <div className="sidebar-header" style={{ paddingTop: '0' }}>
            <label className="sidebar-label" style={{ marginTop: 0 }}>MY PROFILES</label>
            <input
              type="text"
              className="sidebar-input"
              placeholder={'Asad Imran Shah, Asad Imran, "Imran, A"'}
              value={state.myNamesRaw}
              onChange={e => dispatch({ type: 'SET_CONFIG', payload: { myNamesRaw: e.target.value, excludeRaw: state.excludeRaw, aliasRaw: state.aliasRaw } })}
            />

            <label className="sidebar-label">EXCLUDE NAMES/CHATS</label>
            <input
              type="text"
              className="sidebar-input"
              placeholder={'Unknown, Word effects'}
              value={state.excludeRaw}
              onChange={e => dispatch({ type: 'SET_CONFIG', payload: { myNamesRaw: state.myNamesRaw, excludeRaw: e.target.value, aliasRaw: state.aliasRaw } })}
            />

            <label className="sidebar-label">DATE FORMAT</label>
            <select
              className="sidebar-input"
              value={state.dateFormat}
              onChange={e => dispatch({ type: 'SET_CONFIG', payload: { myNamesRaw: state.myNamesRaw, excludeRaw: state.excludeRaw, aliasRaw: state.aliasRaw, dateFormat: e.target.value } })}
            >
              <option value="auto">Auto-detect</option>
              <option value="DMY">DD/MM/YYYY (Day first)</option>
              <option value="MDY">MM/DD/YYYY (Month first)</option>
            </select>

            <label className="sidebar-label" title="Format: Target Name = Alias 1, Alias 2">
              MERGE CONTACTS (ALIASES)
            </label>
            <textarea
              className="sidebar-input"
              rows="2"
              placeholder={'Target Name = Alias 1, Alias 2\nGul Faraz Khan = Gull Faraz'}
              value={state.aliasRaw}
              onChange={e => dispatch({ type: 'SET_CONFIG', payload: { myNamesRaw: state.myNamesRaw, excludeRaw: state.excludeRaw, aliasRaw: e.target.value } })}
            />
          </div>
        </details>

        {/* Upload */}
        <div className="load-data-title">LOAD DATA</div>
        <div className="data-label">Supports HTML, JSON, WhatsApp TXT/ZIP, NDJSON & SMS JSON</div>
        <div className="upload-row">
          <label className="upload-zone">
            <input
              type="file"
              ref={folderRef}
              onChange={onFolderChange}
              webkitdirectory=""
              directory=""
              multiple
            />
            <strong>📂 Folder</strong>
          </label>
          <label className="upload-zone">
            <input
              type="file"
              ref={fileRef}
              onChange={onFileChange}
              accept=".html,.json,.txt,.ndjson,.zip"
              multiple
            />
            <strong>📄 File(s)</strong>
          </label>
        </div>

        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-box">
            <span className="stat-val">{state.validMsgCount.toLocaleString()}</span>
            <span className="stat-lbl">Total Msgs</span>
          </div>
          <div className="stat-box">
            <span className="stat-val">{Object.keys(state.chats).length.toLocaleString()}</span>
            <span className="stat-lbl">Chats</span>
          </div>
        </div>

        {/* Search & Directory */}
        <div className="sidebar-search-wrapper">
          <button
            className="btn-directory"
            disabled={Object.keys(state.chats).length === 0}
            onClick={() => { 
              dispatch({ type: 'SET_VIEW', payload: 'directory' }); 
              if (window.innerWidth <= 768) {
                dispatch({ type: 'TOGGLE_SIDEBAR' });
              }
            }}
          >
            🗂️ View Chat Directory
          </button>
          <input
            type="text"
            className="sidebar-search-input"
            placeholder="Filter contacts..."
            disabled={Object.keys(state.chats).length === 0}
            value={state.searchQuery}
            onChange={onFilterChange}
          />
        </div>

        {/* Tabs */}
        <div className="sidebar-tabs">
          {['all', 'direct', 'group'].map(f => (
            <button
              key={f}
              className={`sidebar-tab ${state.sidebarFilter === f ? 'active' : ''}`}
              onClick={() => dispatch({ type: 'SET_SIDEBAR_FILTER', payload: f })}
            >
              {f === 'all' ? 'All' : f === 'direct' ? 'Direct' : 'Groups'}
            </button>
          ))}
        </div>

        {/* Contact List */}
        <div className="contacts-list">
          {filteredChats.length === 0 ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'gray', fontSize: '0.8rem' }}>
              {Object.keys(state.chats).length === 0 ? 'No data loaded' : 'No contacts found'}
            </div>
          ) : (
            filteredChats.map(([name, data]) => (
              <div
                key={name}
                className={`contact-item ${state.activeChatName === name ? 'active' : ''}`}
                onClick={() => {
                  dispatch({ type: 'SET_ACTIVE_CHAT', payload: name });
                  if (window.innerWidth <= 768) {
                    dispatch({ type: 'TOGGLE_SIDEBAR' });
                  }
                }}
              >
                <div className="contact-name">
                  {name}
                  {state.sidebarFilter === 'all' && data.isGroup && (
                    <span className="group-badge">Group</span>
                  )}
                </div>
                <div className="contact-meta">
                  <span className="badge-sent">↑{data.sent}</span>{' '}
                  <span style={{ color: '#555' }}>|</span>{' '}
                  <span className="badge-recv">↓{data.received}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="sidebar-footer-row">
            <button className="btn" style={{ flex: 1, fontSize: '0.75rem' }} onClick={handleSave}>
              💾 Save State
            </button>
            <button className="btn" style={{ flex: 1, fontSize: '0.75rem' }} onClick={handleLoad}>
              📂 Load State
            </button>
          </div>
          <button
            className="btn btn-danger"
            style={{ width: '100%', fontSize: '0.75rem' }}
            onClick={handleClear}
          >
            🗑️ Clear Records
          </button>
        </div>
      </div>
    </aside>
  );
}
