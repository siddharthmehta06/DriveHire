const listeners = new Map();

async function emit(eventName, payload) {
  const handlers = listeners.get(eventName) || [];
  await Promise.all(handlers.map((handler) => handler(payload)));
  return true;
}

function on(eventName, handler) {
  const list = listeners.get(eventName) || [];
  list.push(handler);
  listeners.set(eventName, list);
  return () => {
    const items = listeners.get(eventName) || [];
    const next = items.filter((item) => item !== handler);
    listeners.set(eventName, next);
  };
}

module.exports = { emit, on };
