const listeners = new Map();

function emit(eventName, payload) {
  const handlers = listeners.get(eventName) || [];
  handlers.forEach((handler) => handler(payload));
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
