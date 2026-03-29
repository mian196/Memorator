// --- Parsing Helpers ---
export function parseInputList(str) {
  const items = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) {
      if (current.trim()) items.push(current.trim());
      current = '';
    } else current += char;
  }
  if (current.trim()) items.push(current.trim());
  return items;
}

export function updateAliasMap(aliasText) {
  const aliasMap = {};
  const lines = aliasText.split('\n');
  lines.forEach(line => {
    if (line.includes('=')) {
      const parts = line.split('=');
      const target = parts[0].trim();
      if (target) {
        parseInputList(parts[1]).map(a => a.toLowerCase()).forEach(a => {
          if (a) aliasMap[a] = target;
        });
      }
    }
  });
  return aliasMap;
}

export function getMappedName(name, aliasMap) {
  return !name ? 'Unknown' : (aliasMap[name.toLowerCase()] || name);
}

export function isMyMessage(sender, myNames, aliasMap) {
  const myNamesLower = myNames.map(n => n.toLowerCase());
  const mappedSender = getMappedName(sender, aliasMap);
  const mappedLower = mappedSender.toLowerCase();
  const rawLower = (sender || '').toLowerCase();
  return myNamesLower.includes(mappedLower) || myNamesLower.includes(rawLower);
}

export function isMyMessageFast(sender, myNamesLower, aliasMap) {
  const mappedSender = getMappedName(sender, aliasMap);
  const mappedLower = mappedSender.toLowerCase();
  const rawLower = (sender || '').toLowerCase();
  return myNamesLower.includes(mappedLower) || myNamesLower.includes(rawLower);
}

export function isExcluded(threadName, senderName, excludeNames) {
  if (excludeNames.length === 0) return false;
  const tLower = (threadName || '').toLowerCase();
  const sLower = (senderName || '').toLowerCase();
  return excludeNames.some(ex => {
    // Exact match on sender name — prevents "unknown" from matching "Simon Riley (unknown)"
    // Substring match on thread name — allows excluding entire chats by partial name
    return sLower === ex || tLower.includes(ex);
  });
}

export function cleanThreadName(rawName, participants = [], myNames = [], folderHint = '') {
  let name = rawName || '';

  // Handle Facebook "Participants: X and Y" title format — strip prefix and own name
  if (/^participants:/i.test(name)) {
    const inner = name.replace(/^participants:\s*/i, '');
    const myNamesLower = myNames.map(n => n.toLowerCase());
    // Split on " and " or ", "
    let parts = inner.split(/\s+and\s+|,\s*/i).map(s => s.trim()).filter(Boolean);
    // Remove only own name — keep "Facebook user" as-is (deleted accounts)
    parts = parts.filter(p => !myNamesLower.includes(p.toLowerCase()) && p.toLowerCase() !== 'you');
    name = parts.join(', ');
  }

  // Handle comma-separated participant lists (e.g. "Alice, Bob, Me")
  if (name && name.includes(',')) {
    let parts = name.split(',').map(s => s.trim()).filter(
      p => !myNames.some(m => m.toLowerCase() === p.toLowerCase())
    );
    if (parts.length > 0) name = parts.join(', ');
    else name = '';
  }

  // Fall back to participants list if name is still unresolvable
  const isUnresolvable = !name || name === 'Unknown Chat' || name.match(/_\d+$/) || name.toLowerCase() === 'unknown';
  if (isUnresolvable) {
    if (participants.length > 0) {
      const myNamesLower = myNames.map(n => n.toLowerCase());
      const others = participants.filter(p => !myNamesLower.includes(p.toLowerCase()) && p.toLowerCase() !== 'you');
      if (others.length > 0) name = others.join(', ');
    }
  }

  // If the name contains "Facebook user", use folder hint to make it unique —
  // multiple deleted-account chats would otherwise all merge into one
  if (folderHint && name.toLowerCase().includes('facebook user')) {
    name = `Facebook user (${folderHint})`;
  } else if ((!name || name === 'Unknown Chat') && folderHint) {
    name = folderHint;
  }

  return name || 'Unknown Chat';
}

export function parseTimestamp(dateStr, dateOrder = null) {
  if (!dateStr) return 0;
  let clean = dateStr
    .replace(/in the mornin'/gi, 'AM')
    .replace(/in the evenin'/gi, 'PM')
    .replace(/th' first month of the yearrr/gi, 'January')
    .replace(/februarrry/gi, 'February')
    .replace(/marrrch/gi, 'March')
    .replace(/the month o' the fool/gi, 'April')
    .replace(/month o' may/gi, 'May')
    .replace(/junnn/gi, 'June')
    .replace(/julyyy/gi, 'July')
    .replace(/augusttt/gi, 'August')
    .replace(/septembarrr/gi, 'September')
    .replace(/octobarrr/gi, 'October')
    .replace(/novembarrr/gi, 'November')
    .replace(/decembarrr/gi, 'December');

  const match = clean.match(
    /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})[, ]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?/
  );
  if (match) {
    let [, p1, p2, yr, hr, min, sec, ampm] = match;
    if (yr.length === 2) yr = '20' + yr;
    let p1Num = parseInt(p1, 10);
    let p2Num = parseInt(p2, 10);
    let m, day;

    if (p1Num > 12 && p2Num <= 12) {
      m = p2Num - 1;
      day = p1Num;
    } else if (p1Num <= 12 && p2Num > 12) {
      m = p1Num - 1;
      day = p2Num;
    } else {
      if (dateOrder === 'MDY') {
        m = p1Num - 1;
        day = p2Num;
      } else if (dateOrder === 'DMY') {
        m = p2Num - 1;
        day = p1Num;
      } else {
        m = p2Num - 1; // Default to DMY
        day = p1Num;
      }
    }

    hr = parseInt(hr, 10);
    if (ampm) {
      if (ampm.toLowerCase() === 'pm' && hr < 12) hr += 12;
      if (ampm.toLowerCase() === 'am' && hr === 12) hr = 0;
    }
    return new Date(parseInt(yr, 10), m, day, hr, parseInt(min, 10), sec ? parseInt(sec, 10) : 0).getTime();
  }

  // Handle Pirate/Messenger HTML dates like "April 22, 2025 10:08:35 PM"
  const textMatch = clean.match(
    /([a-zA-Z]+)\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])/
  );
  if (textMatch) {
    let [, monthStr, d, yr, hr, min, sec, ampm] = textMatch;
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    let m = months.indexOf(monthStr.toLowerCase());
    if (m === -1) m = 0; // Fallback

    hr = parseInt(hr, 10);
    if (ampm) {
      if (ampm.toLowerCase() === 'pm' && hr < 12) hr += 12;
      if (ampm.toLowerCase() === 'am' && hr === 12) hr = 0;
    }
    return new Date(parseInt(yr, 10), m, parseInt(d, 10), hr, parseInt(min, 10), sec ? parseInt(sec, 10) : 0).getTime();
  }

  let d = new Date(clean);
  if (!isNaN(d.getTime())) return d.getTime();

  return 0;
}

export function formatDuration(ms) {
  if (ms === 0 || ms === Infinity) return 'N/A';
  if (ms < 1000) return '< 1s';
  let sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  let min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  let hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ${min % 60}m`;
  let d = Math.floor(hr / 24);
  return `${d}d ${hr % 24}h`;
}

export function formatDurationLong(ms) {
  if (ms === 0 || ms === Infinity) return 'N/A';
  const totalDays = Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  if (totalDays >= 365) {
    const years = Math.floor(totalDays / 365);
    const months = Math.floor((totalDays % 365) / 30);
    const days = totalDays % 30;
    let parts = [];
    if (years) parts.push(`${years} Year${years > 1 ? 's' : ''}`);
    if (months) parts.push(`${months} Month${months > 1 ? 's' : ''}`);
    if (days) parts.push(`${days} Day${days > 1 ? 's' : ''}`);
    return parts.join(', ');
  }
  if (totalDays >= 30) {
    const months = Math.floor(totalDays / 30);
    const days = totalDays % 30;
    let parts = [];
    if (months) parts.push(`${months} Month${months > 1 ? 's' : ''}`);
    if (days) parts.push(`${days} Day${days > 1 ? 's' : ''}`);
    return parts.join(', ');
  }
  return `${totalDays} Day${totalDays > 1 ? 's' : ''}`;
}

export function escapeHtml(t) {
  return String(t).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[m]));
}

export function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function detectPlatform(msg) {
  if (!msg) return 'Unknown';
  if (msg._platform) return msg._platform;
  if (!msg._source) return 'Unknown';
  const src = msg._source.toLowerCase();
  if (src.includes('sms') || src.includes('ndjson')) return 'SMS';
  if (src.includes('whatsapp') || src.includes('txt')) return 'WhatsApp';
  if (src.includes('html') || src.includes('json')) return 'Messenger';
  return 'Unknown';
}

export function formatDateForDisplay(timestamp) {
  if (timestamp == null) return '';
  if (timestamp === 0) return 'Unknown Date';
  const d = new Date(timestamp);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function formatTimeForDisplay(timestamp) {
  if (timestamp == null) return '';
  if (timestamp === 0) return 'Unknown Time';
  const d = new Date(timestamp);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
