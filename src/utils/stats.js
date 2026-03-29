import { getMappedName, isExcluded, formatDuration, isMyMessageFast } from './helpers';

export function recalculateChats(messages, media, myNames, excludeNames, aliasMap, wordEffects = []) {
  const chats = {};
  let validMsgCount = 0;
  const effectiveMyNames = myNames.length > 0 ? myNames : ['Me'];
  const myNamesLower = effectiveMyNames.map(n => n.toLowerCase());

  messages.forEach(msg => {
    let mappedThread = getMappedName(msg.threadName, aliasMap);
    // Strip owner name from thread names like "Facebook user, Simon Riley" → "Facebook user (id)"
    // This happens when myNames was empty at parse time so owner wasn't filtered out
    if (mappedThread.includes(',')) {
      const parts = mappedThread.split(',').map(s => s.trim()).filter(p => !myNamesLower.includes(p.toLowerCase()));
      if (parts.length > 0 && parts.length < mappedThread.split(',').length) {
        mappedThread = parts.join(', ');
      }
    }
    const mappedSender = getMappedName(msg.sender, aliasMap);
    if (isExcluded(mappedThread, mappedSender, excludeNames)) return;

    validMsgCount++;
    if (!chats[mappedThread]) {
      chats[mappedThread] = {
        sent: 0, received: 0, total: 0, list: [],
        mediaCount: 0, participants: new Set(),
        firstMsg: Infinity, lastMsg: 0, platforms: new Set()
      };
    }

    const chat = chats[mappedThread];
    chat.participants.add(mappedSender);

    // Track platform — prefer explicit _platform field, fall back to _source parsing
    if (msg._platform) {
      chat.platforms.add(msg._platform);
    } else if (msg._source) {
      const src = msg._source.toLowerCase();
      if (src.includes('html')) chat.platforms.add('Messenger');
      else if (src.includes('ndjson') || src.includes('sms')) chat.platforms.add('SMS');
      else if (src.includes('json')) chat.platforms.add('Messenger');
      else if (src.includes('txt')) chat.platforms.add('WhatsApp');
    }

    const senderLower = mappedSender.toLowerCase();
    const isMe = isMyMessageFast(msg.sender, myNamesLower, aliasMap);
    if (isMe) chat.sent++;
    else chat.received++;
    chat.total++;

    if (msg.timestamp > 0) {
      if (msg.timestamp < chat.firstMsg) chat.firstMsg = msg.timestamp;
      if (msg.timestamp > chat.lastMsg) chat.lastMsg = msg.timestamp;
    }
    chat.list.push(msg);
  });

  media.forEach(m => {
    const mappedThread = getMappedName(m.threadName, aliasMap);
    const mappedSender = getMappedName(m.sender, aliasMap);
    if (isExcluded(mappedThread, mappedSender, excludeNames)) return;
    if (chats[mappedThread]) chats[mappedThread].mediaCount++;
  });

  wordEffects.forEach(we => {
    const mappedThread = getMappedName(we.threadName, aliasMap);
    if (chats[mappedThread]) {
      if (!chats[mappedThread].wordEffects) chats[mappedThread].wordEffects = [];
      chats[mappedThread].wordEffects.push(we);
    }
  });

  for (const [name, chat] of Object.entries(chats)) {
    const otherParticipants = Array.from(chat.participants).filter(
      p => !myNamesLower.includes(p.toLowerCase())
    );
    chat.isGroup = otherParticipants.length > 1;
  }

  return { chats, validMsgCount };
}

export function computeStatsForMessages(messagesArray, aliasMap) {
  if (!messagesArray || messagesArray.length === 0) return null;
  const sorted = [...messagesArray].filter(m => m.timestamp).sort((a, b) => a.timestamp - b.timestamp);
  if (sorted.length === 0) return null;

  let currentStreak = 0, maxStreak = 0, lastDate = null;
  const responseTimes = {};
  const hours = new Array(24).fill(0);
  const dayCounts = new Set();
  let previousMsg = null;

  sorted.forEach(msg => {
    const mappedSender = getMappedName(msg.sender, aliasMap);
    const dateObj = new Date(msg.timestamp);
    hours[dateObj.getHours()]++;

    const msgDate = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    dayCounts.add(msgDate.getTime());

    if (lastDate) {
      const diffDays = Math.round((msgDate.getTime() - lastDate.getTime()) / (1000 * 3600 * 24));
      if (diffDays === 1) {
        currentStreak++;
        if (currentStreak > maxStreak) maxStreak = currentStreak;
      } else if (diffDays > 1) {
        currentStreak = 1;
      }
    } else {
      currentStreak = 1;
      maxStreak = 1;
    }
    lastDate = msgDate;

    // Track response times per sender — only count when replying to the immediately previous different sender
    // For groups, track per-sender using lastMsgBySender to measure true response time
    if (previousMsg) {
      const prevMappedSender = getMappedName(previousMsg.sender, aliasMap);
      if (prevMappedSender !== mappedSender) {
        // Find the most recent message from prevMappedSender to measure response time from
        const diffMs = msg.timestamp - previousMsg.timestamp;
        if (diffMs >= 0 && diffMs < 1000 * 60 * 60 * 24 * 3) {
          if (!responseTimes[mappedSender]) {
            responseTimes[mappedSender] = { totalMs: 0, count: 0, fastest: Infinity, slowest: 0 };
          }
          responseTimes[mappedSender].totalMs += diffMs;
          responseTimes[mappedSender].count++;
          if (diffMs < responseTimes[mappedSender].fastest) responseTimes[mappedSender].fastest = diffMs;
          if (diffMs > responseTimes[mappedSender].slowest) responseTimes[mappedSender].slowest = diffMs;
        }
      }
    }
    previousMsg = msg;
  });

  const maxHourVal = Math.max(...hours);
  const busiestHourIdx = hours.indexOf(maxHourVal);
  const formatHour = h => h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;

  const responseStats = Object.keys(responseTimes).map(sender => {
    const st = responseTimes[sender];
    return {
      sender,
      avgMs: st.count > 0 ? st.totalMs / st.count : 0,
      fastestMs: st.fastest === Infinity ? 0 : st.fastest,
      slowestMs: st.slowest,
      count: st.count
    };
  }).filter(s => s.count > 0).sort((a, b) => a.avgMs - b.avgMs);

  return {
    maxStreak,
    busiestHour: `${formatHour(busiestHourIdx)} - ${formatHour(busiestHourIdx + 1)} (${maxHourVal} msgs)`,
    responseStats,
    totalDaysActive: dayCounts.size
  };
}
