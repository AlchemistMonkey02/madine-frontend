/* =========================================================================
   Chat service layer — isolated from the UI on purpose.
   Real-time messaging over Socket.IO (served by our own backend at
   /socket.io). The socket authenticates with the same session cookie as the
   rest of the site, and the server only delivers messages between two people
   who have BOTH accepted the connection.
   Messages reach app.js in the shape it has always used:
   { id, conversationId (the other person's id), from: "me" | "them", text, timestamp }.
   Other live events (connection requests, check-ins) are forwarded through
   onEvent() so the UI can refresh without polling.
   ========================================================================= */

const ChatService = (() => {
  let socket = null;
  let myId = null;
  const listeners = { message: [], typing: [], presence: [], event: [], status: [] };
  const presence = {};
  const emit = (type, payload) => listeners[type].forEach((cb) => cb(payload));

  const toLocal = (m) => ({
    id: m.id,
    conversationId: m.from === myId ? m.to : m.from,
    from: m.from === myId ? "me" : "them",
    text: m.text,
    timestamp: m.timestamp,
    read: m.read,
  });

  function connect() {
    const user = AuthService.getUser();
    if (!user || typeof io !== "function") return Promise.resolve({ connected: false });
    if (socket && myId === user.id) return Promise.resolve({ connected: socket.connected });
    disconnect();
    myId = user.id;
    socket = io({ withCredentials: true });
    const activeSocket = socket;
    const invalidate = () => {
      if (socket === activeSocket) AuthService.invalidateSession();
    };
    socket.on("session:invalid", invalidate);
    socket.on("connect_error", (err) => { if (err.message === 'unauthorized') invalidate(); });
    socket.on("connect", () => { emit("status", { connected: true }); refreshPresence(); });
    socket.on("disconnect", () => emit("status", { connected: false }));
    socket.on("message", (m) => emit("message", toLocal(m)));
    socket.on("typing", ({ from, typing }) => emit("typing", { conversationId: from, typing }));
    socket.on("presence", ({ userId, online }) => { presence[userId] = online; emit("presence", { personId: userId, online }); });
    ["connections:changed", "checkins:changed", "notifications:changed"].forEach((name) => socket.on(name, (payload) => emit("event", { name, payload })));
    return Promise.resolve({ connected: true });
  }

  function disconnect() {
    if (socket) socket.disconnect();
    socket = null;
    myId = null;
    Object.keys(presence).forEach((k) => delete presence[k]);
  }

  function isConnected() { return !!socket?.connected; }
  function onMessage(cb) { listeners.message.push(cb); }
  function onTyping(cb) { listeners.typing.push(cb); }
  function onPresence(cb) { listeners.presence.push(cb); }
  function onEvent(cb) { listeners.event.push(cb); }
  function onStatus(cb) { listeners.status.push(cb); }

  // Resolves with the saved message, or rejects with the server's reason
  // (e.g. "You can only message your connections").
  function send(conversationId, text) {
    return new Promise((resolve, reject) => {
      if (!socket?.connected) return reject(new Error("You're offline — reconnecting…"));
      socket.timeout(8000).emit("message:send", { to: conversationId, text }, (timeoutErr, res) => {
        if (timeoutErr) return reject(new Error("Message failed to send — try again"));
        if (res?.error) return reject(new Error(res.error));
        const m = toLocal(res.message);
        emit("message", m);
        resolve(m);
      });
    });
  }

  let typingTimer = null;
  function sendTyping(conversationId) {
    if (!socket?.connected) return;
    if (!typingTimer) socket.emit("typing", { to: conversationId, typing: true });
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => { socket?.emit("typing", { to: conversationId, typing: false }); typingTimer = null; }, 1500);
  }

  function markRead(conversationId) { socket?.emit("messages:read", { with: conversationId }); }

  async function history(conversationId) {
    const { messages } = await Api.get(`/messages/${encodeURIComponent(conversationId)}`);
    return messages.map(toLocal);
  }

  async function conversations() {
    const { conversations } = await Api.get("/conversations");
    return conversations.map((c) => ({ userId: c.userId, last: toLocal(c.last), unread: c.unread }));
  }

  function refreshPresence(ids) {
    const list = ids || (typeof connectedPeople === "function" ? connectedPeople().map((p) => p.id) : []);
    if (!socket?.connected || !list.length) return;
    socket.emit("presence:query", list, (map) => {
      Object.entries(map || {}).forEach(([id, online]) => { presence[id] = online; emit("presence", { personId: id, online }); });
    });
  }

  function getPresence(personId) { return !!presence[personId]; }

  return {
    connect, disconnect, isConnected, onMessage, onTyping, onPresence, onEvent, onStatus,
    send, sendTyping, markRead, history, conversations, refreshPresence, getPresence,
  };
})();
