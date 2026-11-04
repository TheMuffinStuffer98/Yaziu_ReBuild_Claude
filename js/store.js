// Lokale Datenhaltung. Alles liegt im localStorage des Geräts.
// Jedes Profil bekommt einen eigenen Schlüssel-Bereich: ft.<profil-id>.<bereich>
const Store = (() => {
  const PREFIX = 'ft.';
  const ROOT = PREFIX + 'profiles';
  const ACTIVE = PREFIX + 'active';
  const SECTIONS = ['settings', 'days', 'weights', 'workouts', 'custom', 'dishes', 'products', 'favs', 'plans', 'ai'];

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (err) {
      console.warn('Lesen fehlgeschlagen:', key, err);
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error('Speichern fehlgeschlagen:', key, err);
      return false;
    }
  }

  const profiles = () => read(ROOT, []);
  const activeId = () => read(ACTIVE, null);
  const setActive = (id) => write(ACTIVE, id);

  function createProfile(name) {
    const id = 'p' + Date.now().toString(36);
    write(ROOT, [...profiles(), { id, name }]);
    setActive(id);
    return id;
  }

  function renameProfile(id, name) {
    write(ROOT, profiles().map((p) => (p.id === id ? { ...p, name } : p)));
  }

  function deleteProfile(id) {
    const rest = profiles().filter((p) => p.id !== id);
    write(ROOT, rest);
    SECTIONS.forEach((s) => localStorage.removeItem(`${PREFIX}${id}.${s}`));
    if (activeId() === id) setActive(rest[0] ? rest[0].id : null);
  }

  const get = (section, fallback) => read(`${PREFIX}${activeId()}.${section}`, fallback);
  const set = (section, value) => write(`${PREFIX}${activeId()}.${section}`, value);

  return {
    profiles, activeId, setActive, createProfile, renameProfile, deleteProfile, get, set,
  };
})();
