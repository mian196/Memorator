import React, { createContext, useContext, useReducer, useCallback, useRef } from 'react';
import { parseInputList, updateAliasMap, getMappedName, isExcluded, parseTimestamp } from '../utils/helpers';
import { recalculateChats } from '../utils/stats';
import { parseHTML, parseJSON, parseWhatsAppTXT, parseNDJSON, parseSMSJSON } from '../utils/parsers';
import JSZip from 'jszip';
import { saveStateToDB, loadStateFromDB, clearStateFromDB } from '../utils/db';

const AppContext = createContext(null);

const initialState = {
  messages: [],
  messageHashes: new Set(),
  media: [],
  mediaHashes: new Set(),
  chats: {},
  validMsgCount: 0,
  myNamesRaw: '',
  excludeRaw: '',
  aliasRaw: '',
  myNames: [],
  excludeNames: [],
  aliasMap: {},
  dateFormat: 'auto',
  fileRegistry: {},
  sidebarFilter: 'all',
  searchQuery: '',
  chatLimit: 50,
  mediaLimit: 50,
  activeChatName: null,
  activeView: 'search',
  activeChatTab: 'messages',
  sidebarCollapsed: false,
  loading: false,
  loadingMessage: '',
  showEbookModal: false,
  ebookTargetChat: null
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload.loading, loadingMessage: action.payload.message || '' };
    case 'SET_CONFIG': {
      const myNames = parseInputList(action.payload.myNamesRaw || '');
      const excludeNames = parseInputList(action.payload.excludeRaw || '').map(s => s.toLowerCase());
      const aliasMap = updateAliasMap(action.payload.aliasRaw || '');
      return {
        ...state,
        myNamesRaw: action.payload.myNamesRaw ?? state.myNamesRaw,
        excludeRaw: action.payload.excludeRaw ?? state.excludeRaw,
        aliasRaw: action.payload.aliasRaw ?? state.aliasRaw,
        dateFormat: action.payload.dateFormat ?? state.dateFormat,
        myNames, excludeNames, aliasMap
      };
    }
    case 'RECALCULATE': {
      const { chats, validMsgCount } = recalculateChats(
        state.messages, state.media, state.myNames, state.excludeNames, state.aliasMap
      );
      return { ...state, chats, validMsgCount };
    }
    case 'ADD_MESSAGES': {
      const newMessages = [...state.messages];
      const newHashes = new Set(state.messageHashes);
      const newMedia = [...state.media];
      const newMediaHashes = new Set(state.mediaHashes);

      action.payload.messages.forEach(msg => {
        const hash = `${msg.threadName}_${msg.sender}_${msg.timestamp}_${msg.content}`;
        if (!newHashes.has(hash)) {
          newHashes.add(hash);
          newMessages.push(msg);
        }
      });

      if (action.payload.media) {
        action.payload.media.forEach(m => {
          const hash = `${m.threadName}_${m.sender}_${m.dateStr}_${m.filename}`;
          if (!newMediaHashes.has(hash)) {
            newMediaHashes.add(hash);
            newMedia.push(m);
          }
        });
      }

      return {
        ...state,
        messages: newMessages,
        messageHashes: newHashes,
        media: newMedia,
        mediaHashes: newMediaHashes
      };
    }
    case 'SET_FILE_REGISTRY':
      return { ...state, fileRegistry: { ...state.fileRegistry, ...action.payload } };
    case 'SET_ACTIVE_CHAT':
      return { ...state, activeChatName: action.payload, chatLimit: 50, activeChatTab: 'messages', activeView: 'chat' };
    case 'SET_VIEW':
      return { ...state, activeView: action.payload };
    case 'SET_CHAT_TAB':
      return { ...state, activeChatTab: action.payload };
    case 'SET_SIDEBAR_FILTER':
      return { ...state, sidebarFilter: action.payload };
    case 'SET_SEARCH_QUERY':
      return { ...state, searchQuery: action.payload };
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed };
    case 'LOAD_MORE_CHAT':
      return { ...state, chatLimit: state.chatLimit + 50 };
    case 'LOAD_MORE_MEDIA':
      return { ...state, mediaLimit: state.mediaLimit + 50 };
    case 'RESET_MEDIA_LIMIT':
      return { ...state, mediaLimit: 50 };
    case 'RESET_VIEW':
      return { ...state, activeChatName: null, activeView: 'search', activeChatTab: 'messages', chatLimit: 50 };
    case 'DELETE_CHAT': {
      const targetName = action.payload;
      const newMsgs = state.messages.filter(m => getMappedName(m.threadName, state.aliasMap) !== targetName);
      const newMed = state.media.filter(m => getMappedName(m.threadName, state.aliasMap) !== targetName);
      return { ...state, messages: newMsgs, media: newMed, activeChatName: null, activeView: 'search' };
    }
    case 'DELETE_CHAT_RESOURCE': {
      const { chatName, source } = action.payload;
      const newMsgs = state.messages.filter(m => {
        if (getMappedName(m.threadName, state.aliasMap) !== chatName) return true;
        const msgPlatform = m._platform || m._source || 'unknown';
        return msgPlatform !== source;
      });
      const newMed = state.media.filter(m => {
        if (getMappedName(m.threadName, state.aliasMap) !== chatName) return true;
        const msgPlatform = m._platform || m._source || 'unknown';
        return msgPlatform !== source;
      });
      return { ...state, messages: newMsgs, media: newMed };
    }
    case 'SEPARATE_CHAT_RESOURCE': {
      const { chatName, source, newChatName } = action.payload;
      const newMsgs = state.messages.map(m => {
        if (getMappedName(m.threadName, state.aliasMap) !== chatName) return m;
        const msgPlatform = m._platform || m._source || 'unknown';
        if (msgPlatform === source) {
          return { ...m, threadName: newChatName };
        }
        return m;
      });
      const newMed = state.media.map(m => {
        if (getMappedName(m.threadName, state.aliasMap) !== chatName) return m;
        const msgPlatform = m._platform || m._source || 'unknown';
        if (msgPlatform === source) {
          return { ...m, threadName: newChatName };
        }
        return m;
      });
      return { ...state, messages: newMsgs, media: newMed };
    }
    case 'EXCLUDE_NAME': {
      const newExcludeRaw = state.excludeRaw ? `${state.excludeRaw}\n${action.payload}` : action.payload;
      const newExcludeNames = parseInputList(newExcludeRaw).map(s => s.toLowerCase());
      return {
        ...state,
        excludeRaw: newExcludeRaw,
        excludeNames: newExcludeNames
      };
    }
    case 'CLEAR_ALL':
      return {
        ...state,
        messages: [], media: [],
        messageHashes: new Set(), mediaHashes: new Set(),
        chats: {}, validMsgCount: 0,
        activeChatName: null, activeView: 'search'
      };
    case 'RESTORE_STATE': {
      const dateFormat = action.payload.dateFormat || 'auto';
      const dateOrder = (dateFormat === 'DMY' || dateFormat === 'MDY') ? dateFormat : null;
      const restoredMsgs = (action.payload.messages || []).map(m => {
        if (m.dateStr && (m.timestamp === 0 || !m.timestamp)) {
          return { ...m, timestamp: parseTimestamp(m.dateStr, dateOrder) };
        }
        return m;
      });
      const restoredMedia = (action.payload.media || []).map(m => {
        if (m.dateStr && (m.timestamp === 0 || !m.timestamp)) {
          return { ...m, timestamp: parseTimestamp(m.dateStr, dateOrder) };
        }
        return m;
      });
      return {
        ...state,
        messages: restoredMsgs,
        media: restoredMedia,
        messageHashes: new Set(),
        mediaHashes: new Set(),
        myNamesRaw: action.payload.myNamesRaw || state.myNamesRaw,
        excludeRaw: action.payload.excludeRaw || state.excludeRaw,
        aliasRaw: action.payload.aliasRaw || state.aliasRaw
      };
    }
    case 'SHOW_EBOOK_MODAL':
      if (typeof action.payload === 'object') {
        return { ...state, showEbookModal: action.payload.show, ebookTargetChat: action.payload.targetChat || null };
      }
      return { ...state, showEbookModal: action.payload, ebookTargetChat: null };
    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const undoStack = useRef([]);
  const redoStack = useRef([]);

  const saveUndo = useCallback(() => {
    undoStack.current.push({
      messages: [...state.messages],
      media: [...state.media]
    });
    redoStack.current = [];
  }, [state.messages, state.media]);

  const handleUpload = useCallback(async (files) => {
    if (files.length === 0) return;

    const expandedFiles = [];

    // Pre-process ZIP files
    for (const f of files) {
      if (f.name.endsWith('.zip')) {
        try {
          const zip = await JSZip.loadAsync(f);
          for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
            if (zipEntry.dir) continue;

            const isData = relativePath.endsWith('.txt') || relativePath.endsWith('.json') || 
                           relativePath.endsWith('.html') || relativePath.endsWith('.ndjson');
            const isMedia = relativePath.match(/\.(jpg|jpeg|png|gif|mp4|opus|mp3|pdf|doc|docx)$/i);

            if (isData || isMedia) {
              const blob = await zipEntry.async('blob');
              const extractedFile = new File([blob], relativePath.split('/').pop(), { type: blob.type });
              
              // Attach the original zip name + internal path so parsers group them correctly
              Object.defineProperty(extractedFile, 'webkitRelativePath', {
                value: `${f.name.replace('.zip', '')}/${relativePath}`
              });
              expandedFiles.push(extractedFile);
            }
          }
        } catch (e) {
          console.error("Failed to unzip", f.name, e);
        }
      } else {
        expandedFiles.push(f);
      }
    }

    const registry = {};
    expandedFiles.forEach(f => {
      const pathKey = f.webkitRelativePath || f.name;
      registry[pathKey] = f;
    });
    dispatch({ type: 'SET_FILE_REGISTRY', payload: registry });

    const dataFiles = expandedFiles.filter(
      f => (f.name.endsWith('.html') || f.name.endsWith('.json') ||
        f.name.endsWith('.txt') || f.name.endsWith('.ndjson')) && f.size > 0
    );

    if (dataFiles.length === 0) {
      alert('No data files found (even after extracting ZIPs).');
      return;
    }

    dispatch({ type: 'SET_LOADING', payload: { loading: true, message: 'Initializing new batch...' } });

    const allMessages = [];
    const allMedia = [];
    const CHUNK = 20;

    const currMyNames = parseInputList(state.myNamesRaw);
    const currDateFormat = state.dateFormat;
    const mergedRegistry = { ...state.fileRegistry, ...registry };

    let processedCount = 0;

    for (let i = 0; i < dataFiles.length; i += CHUNK) {
      const chunk = dataFiles.slice(i, i + CHUNK);
      for (const file of chunk) {
        try {
          const text = await file.text();
          let result;
          if (file.name.endsWith('.ndjson')) result = parseNDJSON(text, file.name, currMyNames);
          else if (file.name.endsWith('.json')) {
            // Detect SMS JSON (array of objects with address/body) vs Messenger JSON (object with messages array)
            let parsed;
            try { parsed = JSON.parse(text); } catch(e) { parsed = null; }
            if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].address && parsed[0].body !== undefined) {
              result = parseSMSJSON(text, file.name, currMyNames);
            } else {
              result = parseJSON(text, file.webkitRelativePath, currMyNames, mergedRegistry);
            }
          }
          else if (file.name.endsWith('.txt')) result = parseWhatsAppTXT(text, file.name, currMyNames, currDateFormat);
          else result = parseHTML(text, file.webkitRelativePath, currMyNames, mergedRegistry);

          allMessages.push(...result.messages);
          allMedia.push(...result.media);
        } catch (err) { console.error(err); }

        processedCount++;
        dispatch({
          type: 'SET_LOADING',
          payload: { loading: true, message: `Scanned ${processedCount} / ${dataFiles.length} files...` }
        });
      }
      await new Promise(r => setTimeout(r, 0));
    }

    dispatch({ type: 'ADD_MESSAGES', payload: { messages: allMessages, media: allMedia } });
    // Use requestAnimationFrame to ensure state is committed before recalculating
    await new Promise(r => requestAnimationFrame(r));
    dispatch({ type: 'RECALCULATE' });
    dispatch({ type: 'SET_LOADING', payload: { loading: false, message: '' } });
  }, [state.myNamesRaw, state.fileRegistry, state.dateFormat]);

  const handleSave = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: { loading: true, message: 'Saving to Local Storage...' } });
    try {
      await saveStateToDB(state.messages, state.media, state.myNamesRaw, state.excludeRaw, state.aliasRaw, state.dateFormat);
      dispatch({ type: 'SET_LOADING', payload: { loading: true, message: 'Saved Successfully!' } });
      setTimeout(() => dispatch({ type: 'SET_LOADING', payload: { loading: false, message: '' } }), 500);
    } catch (e) {
      alert('Error saving state.');
      dispatch({ type: 'SET_LOADING', payload: { loading: false, message: '' } });
    }
  }, [state.messages, state.media, state.myNamesRaw, state.excludeRaw, state.aliasRaw, state.dateFormat]);

  const handleLoad = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: { loading: true, message: 'Loading from Local Storage...' } });
    try {
      const data = await loadStateFromDB();
      if (data) {
        dispatch({ type: 'RESTORE_STATE', payload: data });
        dispatch({
          type: 'SET_CONFIG',
          payload: { myNamesRaw: data.myNamesRaw, excludeRaw: data.excludeRaw, aliasRaw: data.aliasRaw, dateFormat: data.dateFormat }
        });
        dispatch({ type: 'SET_LOADING', payload: { loading: true, message: 'Loaded Successfully!' } });
        requestAnimationFrame(() => {
          dispatch({ type: 'RECALCULATE' });
          dispatch({ type: 'SET_LOADING', payload: { loading: false, message: '' } });
        });
      } else {
        alert('No saved state found.');
        dispatch({ type: 'SET_LOADING', payload: { loading: false, message: '' } });
      }
    } catch (e) {
      alert('Error loading state.');
      dispatch({ type: 'SET_LOADING', payload: { loading: false, message: '' } });
    }
  }, []);

  const handleClear = useCallback(async () => {
    if (!confirm('Are you sure you want to clear ALL loaded messages and reset the app?')) return;
    dispatch({ type: 'CLEAR_ALL' });
    try { await clearStateFromDB(); } catch (e) { /* ignore */ }
  }, []);

  const value = {
    state,
    dispatch,
    handleUpload,
    handleSave,
    handleLoad,
    handleClear,
    saveUndo,
    undoStack,
    redoStack
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
