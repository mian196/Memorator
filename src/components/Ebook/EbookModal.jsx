import React, { useState, useMemo, useCallback } from 'react';
import { useApp } from '../../contexts/AppContext';
import { getMappedName, isExcluded } from '../../utils/helpers';
import { generateEbookPdf, AVAILABLE_FONTS } from './ebookGenerator';

export default function EbookModal() {
  const { state, dispatch } = useApp();
  const { chats, myNames, excludeNames, aliasMap, myNamesRaw, messages, ebookTargetChat } = state;

  const [ebookName, setEbookName] = useState(ebookTargetChat || 'My Chat Archive');
  const [sortOrder, setSortOrder] = useState('oldest'); // 'oldest' or 'newest'
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [chatType, setChatType] = useState(() => {
    if (state.sidebarFilter === 'direct') return 'individual';
    if (state.sidebarFilter === 'group') return 'group';
    return 'both';
  }); // 'both', 'individual', 'group'
  const [convLimit, setConvLimit] = useState('all'); // 'all', '10', '20', '50', '100', '200', 'custom'
  const [customLimit, setCustomLimit] = useState('');
  const [fontFamily, setFontFamily] = useState('times');
  const [pdfStyle, setPdfStyle] = useState('themed'); // 'themed' or 'simple'
  const [pdfTheme, setPdfTheme] = useState('light');
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [done, setDone] = useState(false);
  const [timeTaken, setTimeTaken] = useState(0);

  // Get all unique chat names based on current global filters
  const availableChats = useMemo(() => {
    let entries = Object.entries(chats);
    
    // Apply modal chatType
    if (chatType === 'individual') entries = entries.filter(([, d]) => !d.isGroup);
    else if (chatType === 'group') entries = entries.filter(([, d]) => d.isGroup);

    // Apply sidebar search query
    const query = state.searchQuery?.toLowerCase().trim();
    if (query) entries = entries.filter(([name]) => name.toLowerCase().includes(query));

    // Sort by total messages (matching sidebar)
    entries.sort(([, a], [, b]) => b.total - a.total);

    if (ebookTargetChat && chats[ebookTargetChat]) {
      return [ebookTargetChat];
    }
    return entries.map(([name]) => name);
  }, [chats, chatType, state.searchQuery, ebookTargetChat]);

  const [selectedChats, setSelectedChats] = useState(() => new Set(availableChats));

  // Keep selected chats in sync when availableChats changes
  React.useEffect(() => {
    setSelectedChats(new Set(availableChats));
  }, [availableChats]);

  const toggleChat = useCallback((name) => {
    setSelectedChats(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const selectAllChats = useCallback(() => {
    setSelectedChats(new Set(availableChats));
  }, [availableChats]);

  const deselectAllChats = useCallback(() => {
    setSelectedChats(new Set());
  }, []);

  // Filter conversations based on criteria
  const filteredConversations = useMemo(() => {
    let entries = Object.entries(chats);

    // Filter by chat type
    if (chatType === 'individual') entries = entries.filter(([, d]) => !d.isGroup);
    else if (chatType === 'group') entries = entries.filter(([, d]) => d.isGroup);

    // Filter by search query from sidebar
    const query = state.searchQuery?.toLowerCase().trim();
    if (query) entries = entries.filter(([name]) => name.toLowerCase().includes(query));

    // Filter by selected chats (the checklist)
    entries = entries.filter(([name]) => selectedChats.has(name));

    // Filter by date
    if (dateStart) {
      const startTs = new Date(dateStart).getTime();
      entries = entries.filter(([, d]) => d.lastMsg >= startTs);
    }
    if (dateEnd) {
      const endTs = new Date(dateEnd).getTime() + 86400000; // include end date
      entries = entries.filter(([, d]) => d.firstMsg <= endTs);
    }

    // Sort by total messages
    entries.sort(([, a], [, b]) => b.total - a.total);

    // Apply conversation limit
    if (convLimit === 'custom' && customLimit) {
      entries = entries.slice(0, parseInt(customLimit));
    } else if (convLimit !== 'all' && convLimit !== 'custom') {
      entries = entries.slice(0, parseInt(convLimit));
    }

    return entries;
  }, [chats, chatType, state.searchQuery, selectedChats, dateStart, dateEnd, convLimit, customLimit]);

  const handleGenerate = useCallback(async () => {
    if (filteredConversations.length === 0) {
      alert('No conversations match your filters.');
      return;
    }

    setGenerating(true);
    setDone(false);
    setProgress(0);
    setProgressText('Preparing ebook data...');
    const startTime = Date.now();

    // onProgress yields to browser on every call so the bar actually moves
    const onProgress = async (pct, text) => {
      setProgress(pct);
      setProgressText(text);
      await new Promise(r => requestAnimationFrame(r));
    };

    try {
      // Build the data for PDF generation
      const ebookData = {
        ebookName,
        aliases: myNamesRaw,
        sortOrder,
        dateStart: dateStart ? new Date(dateStart) : null,
        dateEnd: dateEnd ? new Date(dateEnd + 'T23:59:59') : null,
        conversations: filteredConversations.map(([name, data]) => {
          // Get aliases for this contact
          const contactAliases = [];
          Object.entries(aliasMap).forEach(([alias, target]) => {
            if (target === name) contactAliases.push(alias);
          });

          // Filter messages by date if needed
          let msgs = [...data.list];
          if (dateStart) {
            const startTs = new Date(dateStart).getTime();
            msgs = msgs.filter(m => m.timestamp === 0 || m.timestamp >= startTs);
          }
          if (dateEnd) {
            const endTs = new Date(dateEnd + 'T23:59:59').getTime();
            msgs = msgs.filter(m => m.timestamp === 0 || m.timestamp <= endTs);
          }

          // Sort messages
          msgs.sort((a, b) => {
            const diff = (a.timestamp || 0) - (b.timestamp || 0);
            return sortOrder === 'oldest' ? diff : -diff;
          });

          // Detect platforms
          const platforms = Array.from(data.platforms || new Set());

          // Calculate true min/max for duration — avoid spread on large arrays (stack overflow)
          let firstMsg = data.firstMsg;
          let lastMsg = data.lastMsg;
          for (const m of msgs) {
            const t = m.timestamp;
            if (t && t > 0) {
              if (firstMsg === undefined || t < firstMsg) firstMsg = t;
              if (lastMsg === undefined || t > lastMsg) lastMsg = t;
            }
          }

          return {
            name,
            aliases: contactAliases,
            isGroup: data.isGroup,
            participants: Array.from(data.participants),
            sent: data.sent,
            received: data.received,
            total: data.total,
            firstMsg,
            lastMsg,
            platforms: platforms.length > 0 ? platforms : ['Unknown'],
            messages: msgs
          };
        }),
        myNames,
        aliasMap,
        fontFamily,
        pdfStyle,
        theme: pdfTheme
      };

      await generateEbookPdf(ebookData, onProgress);

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      setTimeTaken(elapsed);
      setProgress(100);
      setProgressText('Done!');
      setGenerating(false);
      setDone(true);
    } catch (err) {
      console.error('Ebook generation failed:', err);
      alert('Failed to generate ebook: ' + err.message);
      setGenerating(false);
    }
  }, [filteredConversations, ebookName, myNamesRaw, sortOrder, dateStart, dateEnd, myNames, aliasMap, dispatch]);

  return (
    <div className="ebook-modal-overlay" onClick={(e) => {
      if (e.target === e.currentTarget && !generating) dispatch({ type: 'SHOW_EBOOK_MODAL', payload: false });
    }}>
      <div className="ebook-modal">
        <h2>📖 Ebook Creator</h2>

        {/* Ebook Name */}
        <div className="ebook-form-row">
          <div className="ebook-form-group">
            <label>Ebook Title</label>
            <input
              type="text"
              value={ebookName}
              onChange={e => setEbookName(e.target.value)}
              placeholder="My Chat Archive"
            />
          </div>
          <div className="ebook-form-group" style={{ maxWidth: 200 }}>
            <label>Font</label>
            <select value={fontFamily} onChange={e => setFontFamily(e.target.value)}>
              {AVAILABLE_FONTS.map(f => (
                <option key={f.value} value={f.value}>{f.label} ({f.category})</option>
              ))}
            </select>
          </div>
        </div>

        {/* PDF Style */}
        <h3>🖨️ PDF Style</h3>
        <div className="ebook-toggle-row">
          <button
            className={`ebook-toggle-btn ${pdfStyle === 'themed' ? 'active' : ''}`}
            onClick={() => setPdfStyle('themed')}
          >
            💬 Chat Bubbles
          </button>
          <button
            className={`ebook-toggle-btn ${pdfStyle === 'simple' ? 'active' : ''}`}
            onClick={() => setPdfStyle('simple')}
          >
            📄 Simple Text
          </button>
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
          {pdfStyle === 'themed'
            ? 'Blue/grey chat bubbles matching the app theme.'
            : 'Plain black-on-white text — smaller file, faster generation.'}
        </div>

        {/* PDF Theme — only relevant for themed style */}
        {pdfStyle === 'themed' && (
          <>
            <h3>🎨 PDF Theme</h3>
            <div className="ebook-toggle-row">
              <button
                className={`ebook-toggle-btn ${pdfTheme === 'light' ? 'active' : ''}`}
                onClick={() => setPdfTheme('light')}
              >
                Light Mode
              </button>
              <button
                className={`ebook-toggle-btn ${pdfTheme === 'dark' ? 'active' : ''}`}
                onClick={() => setPdfTheme('dark')}
              >
                Dark Mode
              </button>
            </div>
          </>
        )}

        {/* Sort Order */}
        <h3>📊 Sort Order</h3>
        <div className="ebook-toggle-row">
          <button
            className={`ebook-toggle-btn ${sortOrder === 'oldest' ? 'active' : ''}`}
            onClick={() => setSortOrder('oldest')}
          >
            Oldest → Newest
          </button>
          <button
            className={`ebook-toggle-btn ${sortOrder === 'newest' ? 'active' : ''}`}
            onClick={() => setSortOrder('newest')}
          >
            Newest → Oldest
          </button>
        </div>

        {/* Date Range */}
        <h3>📅 Date Range Filter</h3>
        <div className="ebook-form-row">
          <div className="ebook-form-group">
            <label>Start Date</label>
            <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} />
          </div>
          <div className="ebook-form-group">
            <label>End Date</label>
            <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} />
          </div>
        </div>

        {/* Chat Type */}
        {!ebookTargetChat && (
          <>
            <h3>💬 Chat Type</h3>
            <div className="ebook-toggle-row">
              {[
                ['both', 'All Chats'],
                ['individual', 'Individual Only'],
                ['group', 'Groups Only']
              ].map(([val, label]) => (
                <button
                  key={val}
                  className={`ebook-toggle-btn ${chatType === val ? 'active' : ''}`}
                  onClick={() => setChatType(val)}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Conversation Limit */}
        {!ebookTargetChat && (
          <>
            <h3>📋 Conversation Limit</h3>
            <div className="ebook-toggle-row" style={{ flexWrap: 'wrap' }}>
              {['10', '20', '50', '100', '200', 'all'].map(val => (
                <button
                  key={val}
                  className={`ebook-toggle-btn ${convLimit === val ? 'active' : ''}`}
                  onClick={() => setConvLimit(val)}
                >
                  {val === 'all' ? 'All' : `Top ${val}`}
                </button>
              ))}
              <button
                className={`ebook-toggle-btn ${convLimit === 'custom' ? 'active' : ''}`}
                onClick={() => setConvLimit('custom')}
              >
                Custom
              </button>
              {convLimit === 'custom' && (
                <input
                  type="number"
                  min="1"
                  value={customLimit}
                  onChange={e => setCustomLimit(e.target.value)}
                  placeholder="Enter number"
                  style={{ width: '120px', marginLeft: '0.5rem' }}
                />
              )}
            </div>
          </>
        )}

        {/* Chat Selection */}
        {!ebookTargetChat && (
          <>
            <h3>💬 Include/Exclude Chats</h3>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <button className="ebook-toggle-btn" onClick={selectAllChats}>Select All</button>
              <button className="ebook-toggle-btn" onClick={deselectAllChats}>Deselect All</button>
            </div>
            <div className="ebook-participant-list">
              {availableChats.map(name => (
                <label key={name} className="ebook-participant-item">
                  <input
                    type="checkbox"
                    checked={selectedChats.has(name)}
                    onChange={() => toggleChat(name)}
                  />
                  <span style={{ fontSize: '0.85rem' }}>{name}</span>
                </label>
              ))}
            </div>
          </>
        )}

        {/* Summary */}
        <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          📊 <strong style={{ color: 'var(--text-main)' }}>{filteredConversations.length}</strong> conversation{filteredConversations.length !== 1 ? 's' : ''} will be included
          {' • '}
          <strong style={{ color: 'var(--text-main)' }}>{filteredConversations.reduce((sum, [, d]) => sum + d.total, 0).toLocaleString()}</strong> total messages
        </div>

        {/* Progress */}
        {(generating || done) && (
          <div className="ebook-progress">
            <div className="ebook-progress-bar">
              <div className="ebook-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="ebook-progress-text">{progressText}</div>
          </div>
        )}

        {/* Success banner */}
        {done && (
          <div className="ebook-success-banner">
            <div className="ebook-success-icon">✅</div>
            <div className="ebook-success-text">
              <strong>PDF generated &amp; downloaded!</strong>
              <span>Completed in {timeTaken}s</span>
            </div>
            <button
              className="btn-generate"
              style={{ marginLeft: 'auto', flexShrink: 0 }}
              onClick={() => dispatch({ type: 'SHOW_EBOOK_MODAL', payload: false })}
            >
              Close
            </button>
          </div>
        )}

        {/* Actions */}
        {!done && (
          <div className="ebook-actions">
            <button
              className="btn-cancel-modal"
              onClick={() => dispatch({ type: 'SHOW_EBOOK_MODAL', payload: false })}
              disabled={generating}
            >
              Cancel
            </button>
            <button
              className="btn-generate"
              onClick={handleGenerate}
              disabled={generating || filteredConversations.length === 0}
            >
              {generating ? `⏳ Generating... ${progress}%` : `📖 Generate Ebook (${filteredConversations.length} chats)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
