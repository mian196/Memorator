import { cleanThreadName, parseTimestamp } from './helpers';

// --- Facebook Messenger HTML Parser ---
export function parseHTML(html, filePath, myNames, fileRegistry) {
  const messages = [];
  const media = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  let rawName = 'Unknown Chat';
  const titleEl = doc.querySelector('title');
  if (titleEl) rawName = titleEl.textContent.trim();
  let threadName = cleanThreadName(rawName, [], myNames);

  const sections = doc.querySelectorAll('section._a6-g');
  if (sections.length === 0) return { messages, media };

  let dirPath = filePath ? filePath.split('/').slice(0, -1).join('/') + '/' : '';

  sections.forEach(sec => {
    const senderEl = sec.querySelector('h2');
    const contentEl = sec.querySelector('._a6-p');
    const footerEl = sec.querySelector('footer');
    const sender = senderEl ? senderEl.textContent.trim() : 'Unknown';
    let dateStr = footerEl ? footerEl.textContent.trim() : '';

    let contentText = contentEl
      ? contentEl.cloneNode(true).textContent.replace(/\s+/g, ' ').trim()
      : '';

    sec.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src');
      if (src) {
        const mediaItem = resolveMedia(src, dirPath, threadName, sender, dateStr, 'image', fileRegistry);
        if (mediaItem) media.push(mediaItem);
      }
    });

    sec.querySelectorAll('a').forEach(a => {
      const href = a.getAttribute('href');
      const text = a.textContent.trim();
      if (href && (href.includes('files/') || text.includes('Download file'))) {
        const mediaItem = resolveMedia(href, dirPath, threadName, sender, dateStr, 'file', fileRegistry);
        if (mediaItem) media.push(mediaItem);
      }
    });

    if (contentText) {
      messages.push({
        threadName, sender, content: contentText, dateStr,
        timestamp: parseTimestamp(dateStr), reactions: [],
        _platform: 'Messenger',
        _source: 'HTML (' + (filePath ? filePath.split('/').slice(-2).join('/') : 'Unknown') + ')'
      });
    }
  });

  return { messages, media };
}

// --- Facebook Messenger JSON Parser ---
export function parseJSON(text, filePath, myNames, fileRegistry) {
  const messages = [];
  const media = [];
  let data;
  try { data = JSON.parse(text); } catch (e) { return { messages, media }; }
  if (!data.messages || !Array.isArray(data.messages)) return { messages, media };

  let rawTitle = data.title || data.threadName || '';
  let parsedParticipants = [];
  if (Array.isArray(data.participants)) {
    parsedParticipants = data.participants
      .map(p => (typeof p === 'object' && p.name ? p.name : (typeof p === 'string' ? p : '')))
      .filter(Boolean);
  }
  let threadName = cleanThreadName(rawTitle, parsedParticipants, myNames);

  const pathParts = filePath.split('/');
  const fileName = pathParts.pop();
  const folderName = pathParts.pop() || '';
  const dirPath = [...pathParts, folderName].filter(Boolean).join('/') + '/';
  const displayPath = folderName ? `${folderName}/${fileName}` : fileName;
  const jsonFolderName = fileName.replace('.json', '');

  data.messages.forEach(msg => {
    if (msg.isUnsent) return;
    const sender = msg.senderName || 'Unknown';
    const content = msg.text || '';
    let dateStr = '';
    let timestamp = msg.timestamp || 0;
    if (timestamp) dateStr = new Date(timestamp).toLocaleString();
    const reactions = msg.reactions ? msg.reactions.map(r => r.reaction) : [];

    if (msg.media && msg.media.length > 0) {
      msg.media.forEach(m => {
        if (m.uri) {
          const mediaItem = resolveMedia(
            dirPath + `${jsonFolderName}/${m.uri.replace(/^\.\//, '')}`,
            dirPath, threadName, sender, dateStr, 'image', fileRegistry
          );
          if (mediaItem) media.push(mediaItem);
        }
      });
    }

    if (content || (msg.media && msg.media.length > 0)) {
      messages.push({
        threadName, sender, content: content || '[Media]', dateStr,
        timestamp, reactions,
        _platform: 'Messenger',
        _source: 'JSON (' + displayPath + ')'
      });
    }
  });

  return { messages, media };
}

// --- WhatsApp TXT Parser ---
export function parseWhatsAppTXT(text, filename, myNames, dateFormat = 'auto') {
  const messages = [];
  let rawName = filename.replace('.txt', '').replace(/^WhatsApp Chat with /i, '').trim();
  let threadName = cleanThreadName(rawName, [], myNames);

  const lines = text.split(/\r?\n/);
  const messageRegex = /^\[?(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}[, ]+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?)\]?\s*[\-]?\s*([^:]+):\s*(.*)$/;

  // Use user-specified date format if not 'auto', otherwise auto-detect
  let currentDateOrder = null;
  if (dateFormat === 'DMY' || dateFormat === 'MDY') {
    currentDateOrder = dateFormat;
  } else {
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(messageRegex);
      if (match) {
        const dMatch = match[1].match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
        if (dMatch) {
          const p1 = parseInt(dMatch[1], 10);
          const p2 = parseInt(dMatch[2], 10);
          if (p1 > 12 && p2 <= 12) {
            currentDateOrder = 'DMY'; break;
          } else if (p1 <= 12 && p2 > 12) {
            currentDateOrder = 'MDY'; break;
          }
        }
      }
    }
  }

  let currentMsg = null;

  lines.forEach(line => {
    const match = line.match(messageRegex);
    if (match) {
      if (currentMsg) messages.push(currentMsg);
      const sender = match[2].trim();
      const dateStr = match[1].trim();
      
      const dMatch = dateStr.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
      if (dMatch) {
        const p1 = parseInt(dMatch[1], 10);
        const p2 = parseInt(dMatch[2], 10);
        if (p1 > 12 && p2 <= 12) currentDateOrder = 'DMY';
        else if (p1 <= 12 && p2 > 12) currentDateOrder = 'MDY';
      }

      currentMsg = {
        threadName, sender, dateStr,
        timestamp: parseTimestamp(dateStr, currentDateOrder),
        content: match[3].trim(),
        reactions: [],
        _platform: 'WhatsApp',
        _source: 'TXT (' + filename + ')'
      };
    } else {
      if (currentMsg && line.trim() !== '') currentMsg.content += '\n' + line;
    }
  });
  if (currentMsg) messages.push(currentMsg);

  return { messages, media: [] };
}

// --- SMS NDJSON Parser ---
export function parseNDJSON(text, filename, myNames) {
  const messages = [];
  const lines = text.split(/\r?\n/);

  lines.forEach(line => {
    if (!line.trim()) return;
    try {
      const data = JSON.parse(line);
      let rawThreadName = data.__display_name || data.address || 'Unknown SMS';
      let threadName = cleanThreadName(rawThreadName, [], myNames);

      let sender = 'Unknown';
      // Android Telephony API: only type 2 = sent. Types 1,3,4,5,6 are not sent.
      const smsType = String(data.type);
      const isSent = smsType === '2';
      if (isSent) {
        sender = myNames.length > 0 ? myNames[0] : 'Me';
      } else {
        sender = data.__display_name || data.address || 'Unknown';
      }

      let content = data.body || '';
      let timestamp = data.date ? parseInt(data.date) : 0;
      let dateStr = timestamp ? new Date(timestamp).toLocaleString() : '';

      if (content) {
        messages.push({
          threadName, sender, content, dateStr,
          timestamp, reactions: [],
          _platform: 'SMS',
          _source: 'NDJSON (' + filename + ')'
        });
      }
    } catch (e) { /* skip invalid lines */ }
  });

  return { messages, media: [] };
}

// --- SMS JSON Array Parser ---
export function parseSMSJSON(text, filename, myNames) {
  const messages = [];
  let data;
  try { data = JSON.parse(text); } catch (e) { return { messages, media: [] }; }
  if (!Array.isArray(data)) return { messages, media: [] };

  data.forEach(sms => {
    if (!sms.body || !sms.address) return;

    const rawAddress = sms.address || 'Unknown SMS';
    const threadName = cleanThreadName(rawAddress, [], myNames);

    // Android Telephony API: only type 2 = sent. Types 1,3,4,5,6 are not sent.
    let sender;
    const smsType = String(sms.type);
    const isSent = smsType === '2';
    if (isSent) {
      sender = myNames.length > 0 ? myNames[0] : 'Me';
    } else {
      sender = rawAddress;
    }

    const content = sms.body || '';
    const timestamp = sms.date ? parseInt(sms.date) : 0;
    const dateStr = timestamp ? new Date(timestamp).toLocaleString() : '';

    if (content) {
      messages.push({
        threadName, sender, content, dateStr,
        timestamp, reactions: [],
        _platform: 'SMS',
        _source: 'SMS JSON (' + filename + ')'
      });
    }
  });

  return { messages, media: [] };
}

// --- Media Resolution Helper ---
function resolveMedia(path, baseDir, threadName, sender, dateStr, type, fileRegistry) {
  let fileObj = fileRegistry[path];
  if (!fileObj) {
    const filename = path.split('/').pop();
    const matchKey = Object.keys(fileRegistry).find(
      key => key.endsWith(filename) && key.startsWith(baseDir)
    );
    if (matchKey) fileObj = fileRegistry[matchKey];
  }
  if (fileObj) {
    return {
      type, url: URL.createObjectURL(fileObj),
      filename: fileObj.name, threadName, sender, dateStr
    };
  }
  return null;
}
