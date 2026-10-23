// Resets data/db.json to the starting demo story.
import { flush, resetDb } from '../db.js';

resetDb();
flush();
console.log('Demo data reset.');
process.exit(0);
