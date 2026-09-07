export class AutosaveConflictError extends Error {
  constructor() {
    super('Another tab saved a newer recovery generation. Review recovery history before saving again.');
    this.name = 'AutosaveConflictError';
  }
}

// Store contract: list() newest first, get(id), append(entry, {expectedHead}),
// migrate(entry, source). All mutations resolve only after transaction commit.
export class IndexedDBGenerationStore {
  constructor({ indexedDB = globalThis.indexedDB, name = 'element-modeler-recovery' } = {}) {
    this.indexedDB = indexedDB;
    this.name = name;
    this.connection = null;
  }

  async open() {
    if (!this.connection) {
      const pending = new Promise((resolve, reject) => {
        if (!this.indexedDB) throw new Error('IndexedDB is unavailable');
        const request = this.indexedDB.open(this.name, 1);
        let cancelled = false;
        request.onupgradeneeded = () => {
          if (cancelled) { request.transaction.abort(); return; }
          const db = request.result;
          db.createObjectStore('generations', { keyPath: 'id', autoIncrement: true });
          db.createObjectStore('meta');
        };
        request.onblocked = () => {
          cancelled = true;
          reject(new Error('Recovery database is blocked by another tab'));
        };
        request.onerror = () => reject(request.error || new Error('Cannot open recovery database'));
        request.onsuccess = () => {
          const db = request.result;
          if (cancelled) { db.close(); return; }
          db.onversionchange = () => {
            db.close();
            this.connection = null;
          };
          db.onclose = () => { this.connection = null; };
          resolve(db);
        };
      });
      this.connection = pending;
      pending.catch(() => { if (this.connection === pending) this.connection = null; });
    }
    return this.connection;
  }

  async read(operation) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('generations', 'readonly');
      let result;
      const request = operation(tx.objectStore('generations'));
      request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error || new Error('Recovery read aborted'));
      tx.onerror = () => {}; // Abort reports the error once.
    });
  }

  async list() {
    return (await this.read(store => store.getAll())).reverse();
  }

  get(id) {
    return this.read(store => store.get(id));
  }

  append(entry, { expectedHead } = {}) {
    return this.write(entry, { expectedHead });
  }

  migrate(entry, source) {
    return this.write(entry, { source });
  }

  async write(entry, { expectedHead, source }) {
    // Never persist caller-supplied keys or a mutable object from live state.
    const record = structuredClone(entry);
    delete record.id;
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['generations', 'meta'], 'readwrite');
      const generations = tx.objectStore('generations');
      const meta = tx.objectStore('meta');
      let result;
      let failure;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure || tx.error || new Error('Recovery write aborted'));
      tx.onerror = () => {};
      const guard = fn => () => {
        try { fn(); } catch (error) { failure = error; tx.abort(); }
      };
      const write = () => {
        const request = generations.add(record);
        request.onsuccess = guard(() => {
          result = { ...record, id: request.result };
          meta.put(result.id, 'head');
          if (source !== undefined) meta.put({ source, id: result.id }, 'legacy');
          const keys = generations.getAllKeys();
          keys.onsuccess = guard(() => {
            for (const key of keys.result.slice(0, -5)) generations.delete(key);
          });
        });
      };
      if (source !== undefined) {
        // Two tabs migrating the same legacy record must produce one generation.
        const previous = meta.get('legacy');
        previous.onsuccess = guard(() => {
          if (previous.result?.source === source) {
            const existing = generations.get(previous.result.id);
            existing.onsuccess = guard(() => {
              if (existing.result) result = existing.result;
              else write(); // Previous migration was pruned before verification.
            });
          } else write();
        });
      } else {
        const head = meta.get('head');
        head.onsuccess = guard(() => {
          if ((head.result ?? null) !== expectedHead) throw new AutosaveConflictError();
          write();
        });
      }
    });
  }

  async close() {
    if (this.connection) (await this.connection).close();
    this.connection = null;
  }
}
