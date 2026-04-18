import { DB_NAME, DB_VERSION, STORE_VIDEO_ENTRY, STORE_SESSION_STATE } from '../shared/constants.js';

/** @type {IDBDatabase|null} */
let _db = null;

export function openDB() { throw new Error('Not implemented'); }
